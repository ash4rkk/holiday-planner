import * as Y from 'yjs'
import { and, eq, getDb, isNull, routeCache, routesUsage, sql } from './db'
import type { DayGap } from './gaps'
import { dayLegs, shiftClock } from './gaps'
import type { LatLng } from './maps'
import { type LegPlan, type LegStep, mergeWalks, planMaxAgeMs, type TravelMode } from './route-plan'
import { routesMonthlyLimit } from './routes-budget'
import { readCards } from './trip-doc'

// Planowanie odcinków (tylko serwer): Google Routes dla komunikacji, OSRM dla pieszo i autem.
// Wyniki trzymamy w route_cache. Warunki Google na to nie pozwalają (dopuszczają tylko współrzędne);
// to świadoma decyzja właściciela prywatnej aplikacji, ryzykiem jest blokada klucza.

const DAILY_LIMIT = 300
let daily = { day: '', count: 0 }

const month = () => Temporal.Now.plainDateISO('Europe/Warsaw').toPlainYearMonth().toString()

export const routesBudgetPln = () => Number(process.env.GOOGLE_ROUTES_MONTHLY_BUDGET_PLN || 0)
export const routesLimit = () => routesMonthlyLimit(routesBudgetPln())

export async function routesUsedThisMonth(): Promise<number> {
  const [row] = await getDb()
    .select({ requests: routesUsage.requests })
    .from(routesUsage)
    .where(eq(routesUsage.month, month()))
  return row?.requests ?? 0
}

/** Rezerwuje zapytanie do Google; false = limit wyczerpany. Atomowe, więc też przy równoległych. */
async function takeRouteRequest(): Promise<boolean> {
  const day = new Date().toISOString().slice(0, 10)
  if (daily.day !== day) daily = { day, count: 0 }
  if (daily.count >= DAILY_LIMIT) return false
  const rows = await getDb()
    .insert(routesUsage)
    .values({ month: month(), requests: 1 })
    .onConflictDoUpdate({
      target: routesUsage.month,
      set: { requests: sql`${routesUsage.requests} + 1` },
      setWhere: sql`${routesUsage.requests} < ${routesLimit()}`,
    })
    .returning({ requests: routesUsage.requests })
  if (rows.length) daily.count++
  return rows.length > 0
}

type Route = { minutes: number; km: number; polyline?: string }

async function osrm(profile: 'foot' | 'car', from: LatLng, to: LatLng): Promise<Route | null> {
  const a = `${from.lng.toFixed(5)},${from.lat.toFixed(5)}`
  const b = `${to.lng.toFixed(5)},${to.lat.toFixed(5)}`
  const url = `https://routing.openstreetmap.de/routed-${profile}/route/v1/${profile}/${a};${b}?overview=simplified`
  const res = await fetch(url, {
    signal: AbortSignal.timeout(8000),
    headers: { 'user-agent': 'Planer/1.0' },
  }).catch(() => null)
  if (!res?.ok) return null
  const body = (await res.json()) as {
    code: string
    routes?: { duration: number; distance: number; geometry: string }[]
  }
  const r = body.code === 'Ok' ? body.routes?.[0] : undefined
  return r
    ? {
        minutes: Math.max(1, Math.round(r.duration / 60)),
        km: Math.round(r.distance / 100) / 10,
        polyline: r.geometry,
      }
    : null
}

type GoogleStep = {
  travelMode?: string
  staticDuration?: string
  transitDetails?: {
    stopDetails?: {
      departureStop?: { name?: string }
      arrivalStop?: { name?: string }
      departureTime?: string
    }
    localizedValues?: { departureTime?: { time?: { text?: string } } }
    headsign?: string
    stopCount?: number
    transitLine?: { name?: string; nameShort?: string; vehicle?: { type?: string } }
  }
}

const VEHICLES: Record<string, string> = {
  BUS: 'autobus',
  TROLLEYBUS: 'trolejbus',
  TRAM: 'tramwaj',
  SUBWAY: 'metro',
  METRO_RAIL: 'metro',
  HEAVY_RAIL: 'pociąg',
  COMMUTER_TRAIN: 'pociąg',
  HIGH_SPEED_TRAIN: 'pociąg',
  LONG_DISTANCE_TRAIN: 'pociąg',
  RAIL: 'pociąg',
  FERRY: 'prom',
  FUNICULAR: 'kolejka',
  CABLE_CAR: 'kolejka',
}

const stepMinutes = (s: GoogleStep) => Number.parseInt(s.staticDuration ?? '0', 10) / 60

function readStep(s: GoogleStep): LegStep {
  const t = s.transitDetails
  if (!t) return { kind: 'walk', minutes: stepMinutes(s) }
  return {
    kind: 'transit',
    minutes: Math.round(stepMinutes(s)),
    line: t.transitLine?.nameShort ?? t.transitLine?.name,
    vehicle: VEHICLES[t.transitLine?.vehicle?.type ?? ''] ?? 'przejazd',
    from: t.stopDetails?.departureStop?.name,
    to: t.stopDetails?.arrivalStop?.name,
    stops: t.stopCount,
    departs: t.localizedValues?.departureTime?.time?.text,
    headsign: t.headsign,
  }
}

const waypoint = (p: LatLng) => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } })

async function transit(
  key: string,
  from: LatLng,
  to: LatLng,
  time: { arrivalTime?: string; departureTime?: string },
): Promise<Omit<LegPlan, 'checkedAt'> | null> {
  const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-goog-api-key': key,
      'x-goog-fieldmask':
        'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs.steps.travelMode,routes.legs.steps.staticDuration,routes.legs.steps.transitDetails',
    },
    body: JSON.stringify({
      origin: waypoint(from),
      destination: waypoint(to),
      travelMode: 'TRANSIT',
      languageCode: 'pl',
      ...time,
    }),
    signal: AbortSignal.timeout(8000),
  }).catch(() => null)
  if (!res?.ok) {
    console.warn('[routes] Google', res?.status)
    return null
  }
  const data = (await res.json()) as {
    routes?: {
      duration?: string
      distanceMeters?: number
      polyline?: { encodedPolyline?: string }
      legs?: { steps?: GoogleStep[] }[]
    }[]
  }
  const route = data.routes?.[0]
  const seconds = Number.parseInt(route?.duration ?? '', 10)
  if (!route || !Number.isFinite(seconds)) return null
  const raw = route.legs?.flatMap((l) => l.steps ?? []) ?? []
  const steps = mergeWalks(raw.map(readStep)).map((s) => ({ ...s, minutes: Math.ceil(s.minutes) }))
  // Ruszyć trzeba tyle wcześniej przed pierwszym odjazdem, ile trwa dojście na przystanek.
  const firstRide = steps.findIndex((s) => s.kind === 'transit')
  const departs = steps[firstRide]?.departs
  const walkBefore = steps.slice(0, Math.max(0, firstRide)).reduce((sum, s) => sum + s.minutes, 0)
  return {
    minutes: Math.ceil(seconds / 60),
    mode: 'transit',
    km: route.distanceMeters ? Math.round(route.distanceMeters / 100) / 10 : undefined,
    departAt: departs ? shiftClock(departs, -walkBefore) : undefined,
    steps,
    polyline: route.polyline?.encodedPolyline,
  }
}

export type LegRequest = {
  from: LatLng
  to: LatLng
  date: string
  leaveAt?: string
  arriveBy?: string
}
export type TripTravel = { timezone: string; travelMode: TravelMode }

const round = (p: LatLng) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`

function legKey({ from, to, date, leaveAt, arriveBy }: LegRequest, mode: TravelMode): string {
  return [mode, round(from), round(to), date, arriveBy ?? `od ${leaveAt}`].join('|')
}

function instant(date: string, time: string, timezone: string): string {
  return Temporal.PlainDateTime.from(`${date}T${time}`)
    .toZonedDateTime(timezone)
    .toInstant()
    .toString()
}

function fromRoute(route: Route, mode: TravelMode, arriveBy?: string): Omit<LegPlan, 'checkedAt'> {
  return {
    minutes: route.minutes,
    mode,
    km: route.km,
    departAt: arriveBy ? shiftClock(arriveBy, -route.minutes) : undefined,
    steps: [],
    polyline: route.polyline,
  }
}

export type PlanResult = { plan: LegPlan | null; limited?: boolean }

/** Plan odcinka: z bazy, gdy wynik jest świeży; inaczej liczony od nowa i zapisany dla obu telefonów. */
export async function planLeg(
  leg: LegRequest,
  trip: TripTravel,
  options: { refresh?: boolean } = {},
): Promise<PlanResult> {
  const key = legKey(leg, trip.travelMode)
  const db = getDb()
  const time = leg.arriveBy ?? leg.leaveAt ?? '12:00'
  const departure = Date.parse(instant(leg.date, time, trip.timezone))
  const [row] = await db.select().from(routeCache).where(eq(routeCache.key, key))
  const age = row ? Date.now() - row.checkedAt.getTime() : Number.POSITIVE_INFINITY
  if (row && !options.refresh && age < planMaxAgeMs(departure - Date.now()))
    return { plan: row.plan as LegPlan }

  let plan: Omit<LegPlan, 'checkedAt'> | null = null
  let limited = false
  if (trip.travelMode === 'drive') {
    const car = await osrm('car', leg.from, leg.to)
    plan = car && fromRoute(car, 'drive', leg.arriveBy)
  } else {
    const walk = await osrm('foot', leg.from, leg.to)
    const walking = walk && fromRoute(walk, 'walk', leg.arriveBy)
    const apiKey = process.env.GOOGLE_ROUTES_API_KEY
    // Krótkie odcinki idzie się pieszo; nie ma po co pytać o rozkład.
    if (trip.travelMode === 'walk' || !apiKey || (walk && walk.minutes <= 10)) plan = walking
    else if (await takeRouteRequest()) {
      const ride = await transit(
        apiKey,
        leg.from,
        leg.to,
        leg.arriveBy
          ? { arrivalTime: instant(leg.date, leg.arriveBy, trip.timezone) }
          : { departureTime: instant(leg.date, time, trip.timezone) },
      )
      plan =
        ride && walking ? (walking.minutes <= ride.minutes ? walking : ride) : (ride ?? walking)
    } else {
      limited = true
      plan = walking
    }
  }
  // Nie udało się policzyć: lepszy starszy wynik niż żaden.
  if (!plan) return { plan: (row?.plan as LegPlan | undefined) ?? null, limited }

  const checkedAt = new Date()
  const saved: LegPlan = { ...plan, checkedAt: checkedAt.toISOString() }
  await db
    .insert(routeCache)
    .values({ key, plan: saved, checkedAt })
    .onConflictDoUpdate({ target: routeCache.key, set: { plan: saved, checkedAt } })
  return { plan: saved, limited }
}

/** Odcinki dnia z zapisanego dokumentu wyjazdu (worker nie ma przeglądarkowego stanu). */
export function legsFromDoc(state: Uint8Array, date: string): DayGap[] {
  const doc = new Y.Doc()
  Y.applyUpdate(doc, state)
  return dayLegs(readCards(doc), date)
}

/** Oznacza przypomnienie „czas wyjść”; true tylko za pierwszym razem. */
export async function markLegAlerted(leg: LegRequest, mode: TravelMode): Promise<boolean> {
  const rows = await getDb()
    .update(routeCache)
    .set({ alertedAt: new Date() })
    .where(and(eq(routeCache.key, legKey(leg, mode)), isNull(routeCache.alertedAt)))
    .returning({ key: routeCache.key })
  return rows.length > 0
}

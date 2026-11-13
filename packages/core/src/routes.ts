import * as Y from 'yjs'
import { addDays } from './dates'
import { eq, getDb, leaveAlerts, lt, or, routeCache, routesDaily, routesUsage, sql } from './db'
import type { DayGap } from './gaps'
import { dayLegs, shiftClock } from './gaps'
import type { LatLng } from './maps'
import {
  choosePlan,
  EARLY_EMPTY_DAYS,
  isFarWalk,
  isStaleSchedule,
  type LegDraft,
  type LegPlan,
  type LegStep,
  mergeWalks,
  needsTransit,
  type PlanInput,
  planMaxAgeMs,
  SUSPECT_GAP_MIN,
  scheduleGap,
  type TransitOutcome,
  type TravelMode,
} from './route-plan'
import { routesMonthlyLimit } from './routes-budget'
import { readCards } from './trip-doc'

// Planowanie odcinków (tylko serwer): Google Routes dla komunikacji, OSRM dla pieszo i autem.
// Wyniki trzymamy w route_cache. Warunki Google na to nie pozwalają (dopuszczają tylko współrzędne);
// to świadoma decyzja właściciela prywatnej aplikacji, ryzykiem jest blokada klucza.

const DAILY_LIMIT = 300
/** Wersja kluczy cache; zmiana unieważnia stare wyniki (sprząta je worker). */
const KEY_VERSION = 'v3'
/** „Rozkład za wcześnie” sprawdzamy ponownie po tylu godzinach. */
const EARLY_RECHECK_MS = 48 * 60 * 60_000
/** Po błędzie Google pytamy ponownie najwcześniej po tylu minutach. */
const ERROR_RECHECK_MS = 10 * 60_000
/** Odcinek, który minął dawniej niż tyle, zostaje przy zapisanym wyniku: rozkład już go nie zmieni. */
const PAST_LEG_MS = 60 * 60_000

const today = () => Temporal.Now.plainDateISO('Europe/Warsaw')
const month = () => today().toPlainYearMonth().toString()

export const routesBudgetPln = () => Number(process.env.GOOGLE_ROUTES_MONTHLY_BUDGET_PLN || 0)
export const routesLimit = () => routesMonthlyLimit(routesBudgetPln())

export async function routesUsedThisMonth(): Promise<number> {
  const [row] = await getDb()
    .select({ requests: routesUsage.requests })
    .from(routesUsage)
    .where(eq(routesUsage.month, month()))
  return row?.requests ?? 0
}

/**
 * Rezerwuje zapytanie do Google; false = limit wyczerpany. Atomowe (też przy równoległych
 * i między web a workerem): dzienny bezpiecznik i miesięczny limit w jednej transakcji.
 */
async function takeRouteRequest(): Promise<boolean> {
  return getDb().transaction(async (tx) => {
    const day = await tx
      .insert(routesDaily)
      .values({ day: today().toString(), requests: 1 })
      .onConflictDoUpdate({
        target: routesDaily.day,
        set: { requests: sql`${routesDaily.requests} + 1` },
        setWhere: sql`${routesDaily.requests} < ${DAILY_LIMIT}`,
      })
      .returning({ requests: routesDaily.requests })
    if (!day.length) return false
    const limit = routesLimit()
    const rows = await tx
      .insert(routesUsage)
      .values({ month: month(), requests: 1 })
      .onConflictDoUpdate({
        target: routesUsage.month,
        set: { requests: sql`${routesUsage.requests} + 1` },
        setWhere: sql`${routesUsage.requests} < ${limit}`,
      })
      .returning({ requests: routesUsage.requests })
    if (!rows.length) {
      // Miesiąc wyczerpany: dzień też cofamy, żeby licznik dnia mówił prawdę.
      await tx
        .update(routesDaily)
        .set({ requests: sql`${routesDaily.requests} - 1` })
        .where(eq(routesDaily.day, today().toString()))
      return false
    }
    return true
  })
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
  // Przeciążony serwer potrafi odpowiedzieć stroną HTML zamiast JSON.
  const body = (await res.json().catch(() => null)) as {
    code?: string
    routes?: { duration: number; distance: number; geometry: string }[]
  } | null
  const r = body?.code === 'Ok' ? body.routes?.[0] : undefined
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
  polyline?: { encodedPolyline?: string }
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
  const line = s.polyline?.encodedPolyline
  const lines = line ? [line] : undefined
  if (!t) return { kind: 'walk', minutes: stepMinutes(s), lines }
  return {
    kind: 'transit',
    lines,
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

type Money = { currencyCode?: string; units?: string; nanos?: number }

function readFare(m?: Money): LegPlan['fare'] {
  if (!m?.currencyCode) return undefined
  const amount = Number(m.units ?? 0) + (m.nanos ?? 0) / 1e9
  return Number.isFinite(amount) && amount > 0
    ? { amount: Math.round(amount * 100) / 100, currency: m.currencyCode }
    : undefined
}

async function transit(
  key: string,
  from: LatLng,
  to: LatLng,
  time: { arrivalTime?: string; departureTime?: string },
): Promise<TransitOutcome> {
  const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-goog-api-key': key,
      'x-goog-fieldmask':
        'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.travelAdvisory.transitFare,routes.legs.steps.travelMode,routes.legs.steps.staticDuration,routes.legs.steps.transitDetails,routes.legs.steps.polyline.encodedPolyline',
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
    console.warn(
      '[routes] Google',
      res?.status ?? 'brak połączenia',
      await res?.text().catch(() => ''),
    )
    return { kind: 'error' }
  }
  const data = (await res.json().catch(() => null)) as {
    routes?: {
      duration?: string
      distanceMeters?: number
      polyline?: { encodedPolyline?: string }
      travelAdvisory?: { transitFare?: Money }
      legs?: { steps?: GoogleStep[] }[]
    }[]
  } | null
  if (!data) return { kind: 'error' }
  const route = data.routes?.[0]
  const seconds = Number.parseInt(route?.duration ?? '', 10)
  // Odpowiedź 200 bez tras: Google nie zna połączenia (noc, brak rozkładu na ten dzień).
  if (!route || !Number.isFinite(seconds)) return { kind: 'empty' }
  const raw = route.legs?.flatMap((l) => l.steps ?? []) ?? []
  const steps = mergeWalks(raw.map(readStep)).map((s) => ({ ...s, minutes: Math.ceil(s.minutes) }))
  // Ruszyć trzeba tyle wcześniej przed pierwszym odjazdem, ile trwa dojście na przystanek.
  const firstRide = steps.findIndex((s) => s.kind === 'transit')
  const departs = steps[firstRide]?.departs
  const walkBefore = steps.slice(0, Math.max(0, firstRide)).reduce((sum, s) => sum + s.minutes, 0)
  const fare = readFare(route.travelAdvisory?.transitFare)
  return {
    kind: 'ok',
    plan: {
      minutes: Math.ceil(seconds / 60),
      mode: 'transit',
      km: route.distanceMeters ? Math.round(route.distanceMeters / 100) / 10 : undefined,
      departAt: departs ? shiftClock(departs, -walkBefore) : undefined,
      steps,
      polyline: route.polyline?.encodedPolyline,
      ...(fare ? { fare } : {}),
    },
  }
}

export type LegRequest = {
  from: LatLng
  to: LatLng
  date: string
  leaveAt?: string
  arriveBy?: string
  /** Tryb ustawiony na karcie; bez niego tryb wyjazdu. */
  mode?: TravelMode
  /** Godzina odcinka wypada dzień później (+1) albo wcześniej (-1) niż `date`. */
  dayOffset?: number
}
export type TripTravel = { timezone: string; travelMode: TravelMode }

const round = (p: LatLng) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`

function legKey(
  { from, to, date, leaveAt, arriveBy }: LegRequest,
  mode: TravelMode,
  ride = false,
): string {
  const when = arriveBy ?? `od ${leaveAt}`
  return [KEY_VERSION, mode, ride ? 'jazda' : 'plan', round(from), round(to), date, when].join('|')
}

function instant(date: string, time: string, timezone: string): string {
  return Temporal.PlainDateTime.from(`${date}T${time}`)
    .toZonedDateTime(timezone)
    .toInstant()
    .toString()
}

function fromRoute(route: Route, mode: TravelMode, arriveBy?: string): LegDraft {
  return {
    minutes: route.minutes,
    mode,
    km: route.km,
    departAt: arriveBy ? shiftClock(arriveBy, -route.minutes) : undefined,
    steps: [],
    polyline: route.polyline,
  }
}

export type PlanResult = { plan: LegPlan | null; limited?: boolean; early?: boolean }

/**
 * Znacznik w cache: „rozkładu na ten dzień jeszcze nie ma”, żeby nie pytać przy każdym otwarciu.
 * `estimate`: trasa orientacyjna, gdy Google podał kursy z innej pory (`isStaleSchedule`).
 */
type EarlyMark = { early: true; checkedAt: string; estimate?: LegPlan }
const isEarlyMark = (plan: unknown): plan is EarlyMark =>
  typeof plan === 'object' && plan !== null && 'early' in plan

/**
 * Znacznik w cache: Google nie dał połączenia (pusta odpowiedź albo błąd). Bez niego każde otwarcie
 * dnia i każdy obrót workera pytałyby Google od nowa. `plan` to wynik zastępczy (dojście pieszo,
 * starszy wynik) albo null.
 */
type MissMark = { miss: 'empty' | 'error'; plan: LegPlan | null; checkedAt: string }
const isMissMark = (plan: unknown): plan is MissMark =>
  typeof plan === 'object' && plan !== null && 'miss' in plan

/** Plan odcinka: z bazy, gdy wynik jest świeży; inaczej liczony od nowa i zapisany dla obu telefonów. */
export async function planLeg(
  request: LegRequest,
  trip: TripTravel,
  // ride: tylko przejazd (inne połączenie), bez zamiany na dojście pieszo.
  // live: z bieżącej pozycji; ta się zmienia, więc wyniku nie ma po co czytać ani zapisywać.
  options: { refresh?: boolean; ride?: boolean; live?: boolean } = {},
): Promise<PlanResult> {
  // Powrót po północy albo zapas przed nocnym lotem: liczymy na dzień, w którym odcinek naprawdę jest.
  const leg = request.dayOffset
    ? { ...request, date: addDays(request.date, request.dayOffset) }
    : request
  const mode = leg.mode ?? trip.travelMode
  const key = legKey(leg, mode, options.ride)
  const db = getDb()
  const time = leg.arriveBy ?? leg.leaveAt ?? '12:00'
  const departure = Date.parse(instant(leg.date, time, trip.timezone))
  const [row] = options.live
    ? []
    : await db.select().from(routeCache).where(eq(routeCache.key, key))
  const age = row ? Date.now() - row.checkedAt.getTime() : Number.POSITIVE_INFINITY
  if (row && isEarlyMark(row.plan) && !options.refresh && age < EARLY_RECHECK_MS)
    return { plan: row.plan.estimate ?? null, early: true }
  const miss = row && isMissMark(row.plan) ? row.plan : null
  const stored = miss ? miss.plan : row && !isEarlyMark(row.plan) ? (row.plan as LegPlan) : null
  // Stare wpisy mogą mieć awaryjną trasę pieszą przez pół kraju; takiej nie pokazujemy.
  const cached = stored && !isFarWalk(stored, mode) ? stored : null
  const toDeparture = departure - Date.now()
  const maxAge = toDeparture < -PAST_LEG_MS ? Number.POSITIVE_INFINITY : planMaxAgeMs(toDeparture)
  if (!options.refresh && row && !isEarlyMark(row.plan)) {
    if (miss && age < (miss.miss === 'error' ? Math.min(ERROR_RECHECK_MS, maxAge) : maxAge))
      return { plan: cached }
    if (!miss && cached && age < maxAge) return { plan: cached }
  }

  const osrmRoute = await osrm(mode === 'drive' ? 'car' : 'foot', leg.from, leg.to)
  const input: PlanInput = {
    mode,
    osrm: osrmRoute && fromRoute(osrmRoute, mode === 'drive' ? 'drive' : 'walk', leg.arriveBy),
    leaveAt: leg.leaveAt,
    arriveBy: leg.arriveBy,
    ride: options.ride,
    daysAhead: today().until(Temporal.PlainDate.from(leg.date)).days,
  }
  const when = (date: string) =>
    leg.arriveBy
      ? { arrivalTime: instant(date, leg.arriveBy, trip.timezone) }
      : { departureTime: instant(date, time, trip.timezone) }
  let outcome: TransitOutcome | undefined
  if (needsTransit(input)) {
    const apiKey = process.env.GOOGLE_ROUTES_API_KEY
    if (!apiKey) outcome = { kind: 'no-key' }
    else if (!(await takeRouteRequest())) outcome = { kind: 'limited' }
    else outcome = await transit(apiKey, leg.from, leg.to, when(leg.date))
    // Kursy kilka godzin obok potrzebnej pory przy dalekiej dacie: porównanie z tym samym dniem
    // tydzień wcześniej (tam rozkład już jest) odróżnia brak rozkładu od rzadkiego kursu.
    if (
      outcome?.kind === 'ok' &&
      !options.ride &&
      !options.live &&
      input.daysAhead > EARLY_EMPTY_DAYS &&
      scheduleGap(outcome.plan, leg) > SUSPECT_GAP_MIN &&
      (await takeRouteRequest())
    ) {
      const before = await transit(apiKey as string, leg.from, leg.to, when(addDays(leg.date, -7)))
      if (
        isStaleSchedule(
          outcome.plan,
          before.kind === 'ok' ? before.plan : null,
          leg,
          input.daysAhead,
        )
      )
        outcome = { kind: 'stale', plan: outcome.plan }
    }
  }
  const choice = choosePlan(input, outcome)
  const checkedAt = new Date()

  if (choice.early) {
    const estimate = choice.plan
      ? { ...choice.plan, checkedAt: checkedAt.toISOString() }
      : undefined
    // Znacznik po pustej albo podejrzanej odpowiedzi Google; poza horyzontem i tak nie pytamy.
    if ((outcome?.kind === 'empty' || outcome?.kind === 'stale') && !options.live) {
      const mark: EarlyMark = {
        early: true,
        checkedAt: checkedAt.toISOString(),
        ...(estimate && { estimate }),
      }
      await db
        .insert(routeCache)
        .values({ key, plan: mark, checkedAt })
        .onConflictDoUpdate({ target: routeCache.key, set: { plan: mark, checkedAt } })
    }
    return { plan: estimate ?? null, early: true }
  }
  const save = (plan: LegPlan | MissMark) =>
    db
      .insert(routeCache)
      .values({ key, plan, checkedAt })
      .onConflictDoUpdate({ target: routeCache.key, set: { plan, checkedAt } })
  // Google zapytany i bez wyniku do zapisania: zostaje znacznik, żeby nie pytać w kółko.
  // Limit i brak klucza znacznika nie dostają: po ich ustąpieniu wynik ma przyjść od razu.
  const missKind =
    outcome?.kind === 'error'
      ? 'error'
      : outcome?.kind === 'empty' || outcome?.kind === 'ok'
        ? 'empty'
        : null
  const mark = (plan: LegPlan | null) =>
    missKind && !options.live
      ? save({ miss: missKind, plan, checkedAt: checkedAt.toISOString() })
      : undefined

  // Nie udało się policzyć: lepszy starszy wynik niż żaden.
  if (!choice.plan) {
    await mark(cached)
    return { plan: cached, limited: choice.limited }
  }
  const saved: LegPlan = { ...choice.plan, checkedAt: checkedAt.toISOString() }
  if (options.live) return { plan: saved, limited: choice.limited }
  if (choice.keep) await save(saved)
  else await mark(saved)
  return { plan: saved, limited: choice.limited }
}

/** Odcinki dnia z zapisanego dokumentu wyjazdu (worker nie ma przeglądarkowego stanu). */
export function legsFromDoc(state: Uint8Array, date: string): DayGap[] {
  const doc = new Y.Doc()
  Y.applyUpdate(doc, state)
  const legs = dayLegs(readCards(doc), date)
  doc.destroy()
  return legs
}

/**
 * Oznacza przypomnienie „czas wyjść”; true tylko za pierwszym razem. Osobna tabela, bo wynik
 * awaryjny (bez klucza, po limicie) nie trafia do cache, a przypomnienie i tak ma przyjść.
 */
export async function markLegAlerted(
  tripId: string,
  leg: Pick<DayGap, 'id' | 'arriveBy'>,
  date: string,
): Promise<boolean> {
  const rows = await getDb()
    .insert(leaveAlerts)
    .values({ key: [tripId, leg.id, date, leg.arriveBy].join('|') })
    .onConflictDoNothing()
    .returning({ key: leaveAlerts.key })
  return rows.length > 0
}

/**
 * Sprzątanie: wyniki tras dla minionych dni, stare wersje kluczy, stare liczniki dzienne
 * i znaczniki przypomnień. Zwraca, ile wierszy cache usunięto.
 */
export async function sweepRouteCache(keepDays = 3): Promise<number> {
  const db = getDb()
  const cutoff = today().subtract({ days: keepDays }).toString()
  const removed = await db
    .delete(routeCache)
    .where(
      or(
        sql`${routeCache.key} not like ${`${KEY_VERSION}|%`}`,
        sql`split_part(${routeCache.key}, '|', 6) < ${cutoff}`,
      ),
    )
    .returning({ key: routeCache.key })
  await db.delete(routesDaily).where(lt(routesDaily.day, cutoff))
  await db
    .delete(leaveAlerts)
    .where(lt(leaveAlerts.alertedAt, new Date(Date.now() - keepDays * 24 * 60 * 60_000)))
  return removed.length
}

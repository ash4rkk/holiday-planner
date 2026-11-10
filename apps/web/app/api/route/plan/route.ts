import { isIsoDate, isIsoTime, type LegPlan } from '@planer/core'
import { planLeg } from '@planer/core/routes'
import { z } from 'zod'
import { getTrip } from '@/lib/trips'

const point = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) })
const time = z.string().refine(isIsoTime).optional()
const body = z.object({
  tripId: z.string(),
  date: z.string().refine(isIsoDate),
  refresh: z.boolean().optional(),
  ride: z.boolean().optional(),
  live: z.boolean().optional(),
  legs: z
    .array(
      z.object({
        id: z.string(),
        from: point,
        to: point,
        leaveAt: time,
        arriveBy: time,
        mode: z.enum(['transit', 'walk', 'drive']).optional(),
        dayOffset: z.number().int().min(-1).max(1).optional(),
      }),
    )
    .max(16),
})

export type PlanResponse = {
  plans: Record<string, LegPlan | null>
  limited: boolean
  /** Odcinki, dla których Google nie ma jeszcze rozkładu (sprawdzimy bliżej wyjazdu). */
  early: string[]
  /** Przy `live`: godzina na miejscu wyjazdu, od której liczono. */
  now?: string
}

/** Plany odcinków jednego dnia. POST, bo service worker ma tego nie zapisywać obok bazy. */
export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'złe dane' }, { status: 400 })
  const { tripId, legs, refresh, ride, live } = parsed.data
  const trip = await getTrip(tripId)
  if (!trip) return Response.json({ error: 'nie ma takiego wyjazdu' }, { status: 404 })

  // „Zdążę?”: rusza się teraz, czyli w strefie wyjazdu, a nie telefonu.
  const local = Temporal.Now.zonedDateTimeISO(trip.timezone)
  const now = `${String(local.hour).padStart(2, '0')}:${String(local.minute).padStart(2, '0')}`
  const date = live ? local.toPlainDate().toString() : parsed.data.date

  const plans: PlanResponse['plans'] = {}
  let limited = false
  const early: string[] = []
  // Kolejno: publiczny serwer OSRM nie lubi serii równoległych zapytań.
  for (const { id, ...leg } of legs) {
    const request = live
      ? { ...leg, date, leaveAt: now, arriveBy: undefined, dayOffset: undefined }
      : { ...leg, date }
    const result = await planLeg(request, trip, { refresh, ride, live }).catch((error) => {
      console.warn('[routes] plan', String(error))
      return { plan: null, limited: false, early: false }
    })
    plans[id] = result.plan
    limited ||= Boolean(result.limited)
    if (result.early) early.push(id)
  }
  return Response.json({ plans, limited, early, now } satisfies PlanResponse, {
    headers: { 'cache-control': 'no-store' },
  })
}

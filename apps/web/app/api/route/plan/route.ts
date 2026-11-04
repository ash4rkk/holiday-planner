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
  legs: z
    .array(z.object({ id: z.string(), from: point, to: point, leaveAt: time, arriveBy: time }))
    .max(16),
})

export type PlanResponse = { plans: Record<string, LegPlan | null>; limited: boolean }

/** Plany odcinków jednego dnia. POST, bo service worker ma tego nie zapisywać obok bazy. */
export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'złe dane' }, { status: 400 })
  const { tripId, date, legs, refresh } = parsed.data
  const trip = await getTrip(tripId)
  if (!trip) return Response.json({ error: 'nie ma takiego wyjazdu' }, { status: 404 })

  const plans: PlanResponse['plans'] = {}
  let limited = false
  // Kolejno: publiczny serwer OSRM nie lubi serii równoległych zapytań.
  for (const { id, ...leg } of legs) {
    const result = await planLeg({ ...leg, date }, trip, { refresh }).catch((error) => {
      console.warn('[routes] plan', String(error))
      return { plan: null, limited: false }
    })
    plans[id] = result.plan
    limited ||= Boolean(result.limited)
  }
  return Response.json({ plans, limited } satisfies PlanResponse, {
    headers: { 'cache-control': 'no-store' },
  })
}

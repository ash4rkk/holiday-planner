import { isIsoDate, isIsoTime } from '@planer/core'
import { z } from 'zod'
import { takeRouteRequest } from '@/lib/routes-usage'
import { getTrip } from '@/lib/trips'

// Czas przejazdu komunikacją (Google Routes API) na żądanie. Warunki EOG pozwalają pokazywać go
// obok MapLibre, o ile bez kroków trasy, ale nie zapisywać, więc nie ma tu żadnego cache.
// Limit miesięczny (kwota z env) jest w bazie; dzienny dodatkowo zatrzymuje błąd w pętli.

const DAILY_LIMIT = 300
let used = { day: '', count: 0 }

const point = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) })
const body = z.object({
  tripId: z.string(),
  from: point,
  to: point,
  date: z.string(),
  time: z.string(),
})

const waypoint = (p: { lat: number; lng: number }) => ({
  location: { latLng: { latitude: p.lat, longitude: p.lng } },
})

export async function POST(request: Request) {
  const key = process.env.GOOGLE_ROUTES_API_KEY
  if (!key) return Response.json({ error: 'brak klucza' }, { status: 501 })
  const parsed = body.safeParse(await request.json().catch(() => null))
  if (!parsed.success || !isIsoDate(parsed.data.date) || !isIsoTime(parsed.data.time))
    return Response.json({ error: 'złe dane' }, { status: 400 })
  const { tripId, from, to, date, time } = parsed.data
  const trip = await getTrip(tripId)
  if (!trip) return Response.json({ error: 'nie ma takiego wyjazdu' }, { status: 404 })

  const day = new Date().toISOString().slice(0, 10)
  if (used.day !== day) used = { day, count: 0 }
  if (used.count >= DAILY_LIMIT)
    return Response.json({ error: 'dzienny limit sprawdzeń' }, { status: 429 })
  if (!(await takeRouteRequest()))
    return Response.json({ error: 'miesięczny limit sprawdzeń' }, { status: 429 })
  used.count++

  const departure = Temporal.PlainDateTime.from(`${date}T${time}`)
    .toZonedDateTime(trip.timezone)
    .toInstant()
    .toString()
  const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-goog-api-key': key,
      'x-goog-fieldmask': 'routes.duration',
    },
    body: JSON.stringify({
      origin: waypoint(from),
      destination: waypoint(to),
      travelMode: 'TRANSIT',
      departureTime: departure,
    }),
    signal: AbortSignal.timeout(8000),
  }).catch(() => null)
  if (!res?.ok) {
    console.warn('[routes] Google', res?.status)
    return Response.json({ error: 'nie udało się sprawdzić' }, { status: 502 })
  }
  const data = (await res.json()) as { routes?: { duration?: string }[] }
  const seconds = Number.parseInt(data.routes?.[0]?.duration ?? '', 10)
  return Response.json(
    { minutes: Number.isFinite(seconds) ? Math.ceil(seconds / 60) : null },
    { headers: { 'cache-control': 'no-store' } },
  )
}

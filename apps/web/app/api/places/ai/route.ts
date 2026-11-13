import { z } from 'zod'
import { originalPlaceQuery } from '@/lib/ai/place-name'
import { getCurrentUser } from '@/lib/auth/user'
import { geocode } from '@/lib/maps-resolve'
import { tripArea } from '@/lib/trip-place'
import { getTrip } from '@/lib/trips'

const body = z.object({
  tripId: z.string().max(64),
  name: z.string().min(1).max(200),
  address: z.string().max(300).optional(),
})

/**
 * „znajdź przez AI” w karcie: AI zamienia nazwę (np. przetłumaczoną przez Mapy Google) na oryginalną
 * z miastem, a geokoder szuka współrzędnych. Odpowiedź bez lat/lng = nie znaleziono.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser()
  const parsed = body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'nieprawidłowe dane' }, { status: 400 })
  const { tripId, name, address } = parsed.data
  const trip = await getTrip(tripId)
  if (!trip) return Response.json({ error: 'nie ma takiego wyjazdu' }, { status: 404 })
  const query = await originalPlaceQuery({ name, address, near: tripArea(trip) }, user.id)
  if (!query) return Response.json({})
  const at = await geocode(query).catch(() => undefined)
  return Response.json(at ? { ...at, query } : { query })
}

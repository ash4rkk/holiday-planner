import { z } from 'zod'
import { getCurrentUser } from '@/lib/auth/user'
import { resolvePlace } from '@/lib/maps-resolve'
import { tripArea } from '@/lib/trip-place'
import { getTrip } from '@/lib/trips'

const body = z.object({
  title: z.string().max(500).optional(),
  text: z.string().max(4000).optional(),
  url: z.string().max(2000).optional(),
  tripId: z.string().max(64).optional(),
})

/** Rozwija link Google Maps (wklejony albo udostępniony) do nazwy, adresu i współrzędnych. */
export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'nieprawidłowe dane' }, { status: 400 })
  const user = await getCurrentUser()
  const { tripId, ...shared } = parsed.data
  const trip = tripId ? await getTrip(tripId) : undefined
  return Response.json(
    await resolvePlace(shared, { userId: user.id, ...(trip && { near: tripArea(trip) }) }),
  )
}

import { z } from 'zod'
import { originalPlaceQuery } from '@/lib/ai/place-name'
import { getCurrentUser } from '@/lib/auth/user'
import { findGooglePlace } from '@/lib/google-places'
import { geocode } from '@/lib/maps-resolve'
import { tripArea, tripPlace } from '@/lib/trip-place'
import { getTrip } from '@/lib/trips'

const body = z.object({
  tripId: z.string().max(64),
  name: z.string().min(1).max(200),
  address: z.string().max(300).optional(),
})

export type FoundPlace = {
  lat: number
  lng: number
  /** Co znaleziono — adres z Google albo nazwa od AI — do sprawdzenia na mapce. */
  label: string
  source: 'google' | 'ai'
  /** Adres z Google, gdy karta go nie miała. */
  address?: string
}

/**
 * „znajdź na mapie” w karcie bez pinezki: Google Places (zna też nazwy przetłumaczone przez Mapy
 * Google), a bez klucza, po limicie albo bez wyniku — AI podaje nazwę oryginalną, geokoder szuka.
 * Odpowiedź `{}` = nie znaleziono.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser()
  const parsed = body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'nieprawidłowe dane' }, { status: 400 })
  const { tripId, name, address } = parsed.data
  const trip = await getTrip(tripId)
  if (!trip) return Response.json({ error: 'nie ma takiego wyjazdu' }, { status: 404 })
  const near = tripArea(trip)
  const google = await findGooglePlace(
    [name, address || near].filter(Boolean).join(', '),
    await tripPlace(trip),
  )
  if (google)
    return Response.json({
      lat: google.lat,
      lng: google.lng,
      label: google.address ?? name,
      source: 'google',
      ...(google.address && { address: google.address }),
    } satisfies FoundPlace)
  const query = await originalPlaceQuery({ name, address, near }, user.id)
  const at = query ? await geocode(query).catch(() => undefined) : undefined
  if (!query || !at) return Response.json({})
  return Response.json({ ...at, label: query, source: 'ai' } satisfies FoundPlace)
}

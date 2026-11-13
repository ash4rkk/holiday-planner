import { type LatLng, type PlaceHit, photonPlaces } from '@planer/core'
import { logEvent } from '@planer/core/events'
import { memoCache, parseLatLng } from '@/lib/memo-cache'
import { tripPlace } from '@/lib/trip-place'
import { getTrip } from '@/lib/trips'

const USER_AGENT = 'Planer/1.0 (+https://planer.wiergowsky.com)'
const cache = memoCache<PlaceHit[]>(24 * 60 * 60_000)

/**
 * Podpowiedzi miejsc do karty (Photon, OSM, bez klucza). Wyniki przesunięte w stronę okolicy
 * wyjazdu: `at` (środek miejsc z kart) albo miejsce z nazwy i kraju wyjazdu — inaczej „Fig Tree
 * House” trafia w Londyn.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const q = params.get('q')?.trim().slice(0, 200) ?? ''
  if (q.length < 3) return Response.json({ places: [] })
  let near: LatLng | undefined = parseLatLng(params.get('at'))
  const tripId = params.get('tripId')
  if (!near && tripId) {
    const trip = await getTrip(tripId).catch(() => undefined)
    near = trip && (await tripPlace(trip))
  }
  const key = `${q.toLowerCase()}|${near ? `${near.lat.toFixed(1)},${near.lng.toFixed(1)}` : ''}`
  try {
    const places = await cache(key, async () => {
      const url = new URL('https://photon.komoot.io/api/')
      url.search = new URLSearchParams({
        q,
        limit: '5',
        ...(near && { lat: near.lat.toFixed(3), lon: near.lng.toFixed(3) }),
      }).toString()
      const res = await fetch(url, {
        headers: { 'user-agent': USER_AGENT },
        signal: AbortSignal.timeout(5000),
      })
      if (!res.ok) throw new Error(`photon ${res.status}`)
      return photonPlaces(await res.json())
    })
    return Response.json({ places }, { headers: { 'cache-control': 'private, max-age=3600' } })
  } catch (error) {
    void logEvent('warn', 'miejsca', `Photon: ${String(error)}`)
    return Response.json({ error: 'wyszukiwarka nie odpowiada' }, { status: 502 })
  }
}

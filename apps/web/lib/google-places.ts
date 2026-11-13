import 'server-only'
import { type GooglePlace, googlePlaceDetails, googlePlaceId, type LatLng } from '@planer/core'
import { logEvent } from '@planer/core/events'
import { takePlacesRequest } from '@planer/core/places'
import { memoCache } from '@/lib/memo-cache'

// Google Places (New): Text Search z samym ID miejsca jest darmowy, Place Details Essentials
// (współrzędne, adres) ma 10 000 darmowych zapytań w miesiącu — pilnuje tego licznik places_usage.
// Klucz ten sam co dla tras (GOOGLE_ROUTES_API_KEY) z włączonym Places API (New).
// Współrzędne zapisujemy w kartach na stałe, a warunki Google pozwalają trzymać je 30 dni — to
// świadoma decyzja właściciela (jak route_cache); ryzykiem jest blokada klucza.

const TIMEOUT_MS = 6000
const BIAS_RADIUS_M = 50_000
const cache = memoCache<GooglePlace | null>(30 * 24 * 60 * 60_000)

export const googlePlacesConfigured = () => Boolean(process.env.GOOGLE_ROUTES_API_KEY)

/**
 * Miejsce z Google dla tekstu („Baszta Rybacka, Budapeszt”), przesunięte w stronę `near`.
 * undefined: brak klucza, limit miesiąca, błąd albo nic nie znaleziono.
 */
export async function findGooglePlace(
  query: string,
  near?: LatLng,
): Promise<GooglePlace | undefined> {
  const key = process.env.GOOGLE_ROUTES_API_KEY
  const text = query.trim().slice(0, 300)
  if (!key || !text) return undefined
  const cacheKey = `${text.toLowerCase()}|${near ? `${near.lat.toFixed(1)},${near.lng.toFixed(1)}` : ''}`
  try {
    const found = await cache(cacheKey, async () => {
      const search = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-goog-api-key': key,
          // Tylko ID — wyszukiwanie jest wtedy darmowe (Text Search Essentials IDs Only).
          'x-goog-fieldmask': 'places.id',
        },
        body: JSON.stringify({
          textQuery: text,
          languageCode: 'pl',
          pageSize: 1,
          ...(near && {
            locationBias: {
              circle: {
                center: { latitude: near.lat, longitude: near.lng },
                radius: BIAS_RADIUS_M,
              },
            },
          }),
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      if (!search.ok) throw new Error(`Places searchText ${search.status}`)
      const id = googlePlaceId(await search.json())
      if (!id) return null
      if (!(await takePlacesRequest())) {
        void logEvent('warn', 'miejsca', 'Google Places: limit miesiąca wyczerpany')
        throw new Error('limit')
      }
      const details = await fetch(
        `https://places.googleapis.com/v1/places/${encodeURIComponent(id)}?languageCode=pl`,
        {
          headers: { 'x-goog-api-key': key, 'x-goog-fieldmask': 'id,location,formattedAddress' },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        },
      )
      if (!details.ok) throw new Error(`Places details ${details.status}`)
      return googlePlaceDetails(await details.json()) ?? null
    })
    return found ?? undefined
  } catch (error) {
    if (String(error) !== 'Error: limit')
      void logEvent('warn', 'miejsca', `Google: ${String(error)}`)
    return undefined
  }
}

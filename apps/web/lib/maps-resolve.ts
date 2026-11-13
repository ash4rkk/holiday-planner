import 'server-only'
import {
  coordsFromMapsUrl,
  geocodeQueries,
  isAllowedMapsHost,
  type LatLng,
  nameFromMapsUrl,
  parseShared,
  unwrapConsentUrl,
} from '@planer/core'
import { originalPlaceQuery } from '@/lib/ai/place-name'
import { findGooglePlace } from '@/lib/google-places'
import { redirectTarget } from '@/lib/safe-fetch'

export type ResolvedPlace = {
  name: string
  address?: string
  lat?: number
  lng?: number
  mapsUrl?: string
  /** Inny (nie-mapowy) link z udostępnienia — podgląd Open Graph w etapie 5. */
  otherUrl?: string
}

const USER_AGENT = 'Planer/1.0 (+https://planer.wiergowsky.com)'
const TIMEOUT_MS = 5000

/** Rozwija krótki link po przekierowaniach, tylko w obrębie hostów Google (bez SSRF). */
async function followRedirects(start: string): Promise<string> {
  let url = unwrapConsentUrl(start)
  for (let hop = 0; hop < 6 && !coordsFromMapsUrl(url); hop++) {
    if (!isAllowedMapsHost(url)) break
    const location = await redirectTarget(url, {
      'user-agent': USER_AGENT,
      'accept-language': 'pl',
    })
    if (!location) break
    url = unwrapConsentUrl(new URL(location, url).href)
  }
  return url
}

/** Jedno zapytanie do Nominatim (OSM). */
async function nominatim(query: string): Promise<LatLng | undefined> {
  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.search = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    limit: '1',
    'accept-language': 'pl',
  }).toString()
  const res = await fetch(url, {
    headers: { 'user-agent': USER_AGENT },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) return undefined
  const [hit] = (await res.json()) as { lat: string; lon: string }[]
  return hit ? { lat: Number(hit.lat), lng: Number(hit.lon) } : undefined
}

// Zasady Nominatim: najwyżej jedno zapytanie na sekundę.
const NOMINATIM_GAP_MS = 1100

/** Geokodowanie zapasowe: kolejne warianty adresu (`geocodeQueries`), aż któryś trafi. */
export async function geocode(query: string): Promise<LatLng | undefined> {
  const queries = geocodeQueries(query)
  for (const [i, q] of queries.entries()) {
    if (i > 0) await new Promise((r) => setTimeout(r, NOMINATIM_GAP_MS))
    const hit = await nominatim(q)
    if (hit) return hit
  }
  return undefined
}

/** Kontekst wyjazdu dla rozwijania udostępnień: kto pyta (koszt AI) i gdzie jest wyjazd. */
export type PlaceContext = { userId: string | null; near?: string; nearAt?: LatLng }

/**
 * Udostępnienie z Google Maps → nazwa, adres, współrzędne. Błędy sieci nie przerywają — zostaje to,
 * co wiadomo. Z `context`, gdy link nie ma współrzędnych (Mapy po polsku tłumaczą nazwy, a link
 * niesie tylko wewnętrzne ID Google): Google Places, potem geokoder (OSM), na końcu AI podaje
 * nazwę oryginalną i geokoder szuka jeszcze raz.
 */
export async function resolvePlace(
  input: {
    title?: string
    text?: string
    url?: string
  },
  context?: PlaceContext,
): Promise<ResolvedPlace> {
  const shared = parseShared(input)
  let finalUrl = shared.mapsUrl
  if (shared.mapsUrl) {
    try {
      finalUrl = await followRedirects(shared.mapsUrl)
    } catch (error) {
      console.warn('[maps] rozwijanie linku nie powiodło się', String(error))
    }
  }
  let coords = finalUrl ? coordsFromMapsUrl(finalUrl) : undefined
  let address = shared.address
  const name = shared.name ?? (finalUrl && nameFromMapsUrl(finalUrl))
  // Nazwa z adresu linku zwykle zawiera miasto: „Budapest, Baszta Rybacka, 1014 Węgry”.
  const fromUrl = finalUrl ? nameFromMapsUrl(finalUrl) : undefined
  const hint = shared.address ?? (fromUrl && fromUrl !== name ? fromUrl : undefined)
  if (!coords && context && name && shared.mapsUrl) {
    const google = await findGooglePlace(
      [name, hint ?? context.near].filter(Boolean).join(', '),
      context.nearAt,
    )
    if (google) {
      coords = { lat: google.lat, lng: google.lng }
      address ??= google.address
    }
  }
  const query = shared.address ?? name
  if (!coords && query) {
    try {
      coords = await geocode(query)
    } catch (error) {
      console.warn('[maps] geokodowanie nie powiodło się', String(error))
    }
  }
  if (!coords && context && name && shared.mapsUrl) {
    const original = await originalPlaceQuery(
      { name, address: hint, near: context.near },
      context.userId,
    )
    if (original) coords = await geocode(original).catch(() => undefined)
  }
  return {
    name: name || shared.address || 'miejsce',
    address,
    ...coords,
    mapsUrl: shared.mapsUrl,
    otherUrl: shared.otherUrl,
  }
}

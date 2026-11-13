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

/** Udostępnienie z Google Maps → nazwa, adres, współrzędne. Błędy sieci nie przerywają — zostaje to, co wiadomo. */
export async function resolvePlace(input: {
  title?: string
  text?: string
  url?: string
}): Promise<ResolvedPlace> {
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
  const name = shared.name ?? (finalUrl && nameFromMapsUrl(finalUrl))
  const query = shared.address ?? name
  if (!coords && query) {
    try {
      coords = await geocode(query)
    } catch (error) {
      console.warn('[maps] geokodowanie nie powiodło się', String(error))
    }
  }
  return {
    name: name || shared.address || 'miejsce',
    address: shared.address,
    ...coords,
    mapsUrl: shared.mapsUrl,
    otherUrl: shared.otherUrl,
  }
}

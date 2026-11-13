import type { CardSnapshot } from './cards'
import { addDays, dateRange } from './dates'
import { staysOver } from './trip-doc'

// Linki Google Maps: rozpoznanie, wyciąganie nazwy i współrzędnych, link do nawigacji.
// Formaty linków Google się zmieniają — stąd kilka wzorców i geokodowanie adresu jako zapas
// (apps/web/lib/maps-resolve.ts).

export type LatLng = { lat: number; lng: number }

/**
 * Największe skupisko punktów (łączone, gdy leżą bliżej niż `km` od któregoś z grupy). Kadr mapy
 * „wszystkie” na nim, żeby lotnisko w innym kraju nie oddalało widoku na pół Europy.
 */
export function mainCluster<T extends LatLng>(points: T[], km = 50): T[] {
  const groups: T[][] = []
  for (const p of points) {
    const near = groups.filter((g) => g.some((q) => distanceKm(p, q) <= km))
    const merged = [p, ...near.flat()]
    for (const g of near) groups.splice(groups.indexOf(g), 1)
    groups.push(merged)
  }
  const best = groups.reduce<T[]>((top, g) => (g.length > top.length ? g : top), [])
  // W kolejności wejścia, jak reszta listy.
  return points.filter((p) => best.includes(p))
}

/** Odległość w linii prostej (km); przybliżenie równoprostokątne wystarcza do setek kilometrów. */
export function distanceKm(a: LatLng, b: LatLng): number {
  const dLat = (a.lat - b.lat) * 111
  const dLng = (a.lng - b.lng) * 111 * Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180)
  return Math.hypot(dLat, dLng)
}

// Domena krajowa to dokładnie 2 litery — inaczej przejdzie cudza google.xy.io. Wzorzec nie wystarcza:
// serwer i tak łączy się tylko z adresami publicznymi (lib/safe-fetch.ts).
const GOOGLE_HOST = /^(?:www\.|maps\.)?google\.(?:com|[a-z]{2}|co\.[a-z]{2}|com\.[a-z]{2})$/i

/** Czy to link do Google Maps (krótki maps.app.goo.gl, goo.gl/maps albo google.*\/maps). */
export function isGoogleMapsUrl(raw: string): boolean {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return false
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false
  const host = url.hostname.toLowerCase()
  if (host === 'maps.app.goo.gl') return true
  if (host === 'goo.gl') return url.pathname.startsWith('/maps')
  if (host.startsWith('maps.google.')) return GOOGLE_HOST.test(host)
  return GOOGLE_HOST.test(host) && url.pathname.startsWith('/maps')
}

/** Hosty, po których resolver może chodzić przy rozwijaniu przekierowań. */
export function isAllowedMapsHost(raw: string): boolean {
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:' || url.port || url.username || url.password) return false
    const host = url.hostname.toLowerCase()
    return (
      host === 'maps.app.goo.gl' ||
      host === 'goo.gl' ||
      host === 'consent.google.com' ||
      GOOGLE_HOST.test(host)
    )
  } catch {
    return false
  }
}

const URL_RE = /https?:\/\/[^\s<>"']+/gi

export function findUrls(text: string): string[] {
  return [...text.matchAll(URL_RE)].map((m) => m[0].replace(/[),.;]+$/, ''))
}

export type SharedPlace = { name?: string; address?: string; mapsUrl?: string; otherUrl?: string }

/**
 * Dane z „Udostępnij” (title, text, url). Google Maps zwykle wkłada do `text` nazwę, adres i krótki
 * link, każde w osobnej linii; czasem tylko link.
 */
export function parseShared(input: { title?: string; text?: string; url?: string }): SharedPlace {
  const text = [input.text ?? '', input.url ?? ''].join('\n')
  const urls = findUrls(text)
  const mapsUrl = urls.find(isGoogleMapsUrl)
  const otherUrl = urls.find((u) => !isGoogleMapsUrl(u))
  const lines = (input.text ?? '')
    .split('\n')
    .map((l) => l.replace(URL_RE, '').trim())
    .filter(Boolean)
  const title = input.title?.trim()
  const name = lines[0] ?? (title && !findUrls(title).length ? title : undefined)
  const address = lines.length > 1 ? lines.slice(1).join(', ') : undefined
  return { name, address, mapsUrl, otherUrl }
}

/**
 * Warianty zapytania do geokodera (Nominatim), od najdokładniejszego. Adres przepisany po polsku
 * („1143 Budapeszt, 61 Hungária körút, Węgry”) Nominatim odrzuca przez kraj na końcu, więc kolejne
 * próby go pomijają, a ostatnia także kody pocztowe. Najwyżej trzy zapytania.
 */
export function geocodeQueries(query: string): string[] {
  const parts = query
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
  const out = [parts.join(', ')]
  if (parts.length > 1) {
    const head = parts.slice(0, -1)
    out.push(head.join(', '))
    out.push(
      head
        .map((p) => p.replace(/\b\d{2}-?\d{3}\b|\b\d{4,5}\b/g, '').trim())
        .filter(Boolean)
        .join(', '),
    )
  }
  return [...new Set(out.filter(Boolean))]
}

function valid(lat: number, lng: number): LatLng | undefined {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) return undefined
  return { lat, lng }
}

const NUM = '(-?\\d{1,3}(?:\\.\\d+)?)'

/**
 * Współrzędne z pełnego linku. Kolejność: pinezka miejsca (!3d…!4d…), parametry zapytania
 * (q, query, ll, destination, center), ścieżka /search/ i /dir/, na końcu środek widoku (@lat,lng).
 */
export function coordsFromMapsUrl(raw: string): LatLng | undefined {
  let decoded = raw
  try {
    decoded = decodeURIComponent(raw)
  } catch {}
  const pin = decoded.match(new RegExp(`!3d${NUM}!4d${NUM}`))
  if (pin) return valid(Number(pin[1]), Number(pin[2]))

  try {
    const url = new URL(raw)
    for (const key of ['q', 'query', 'll', 'destination', 'center', 'sll']) {
      const value = url.searchParams.get(key)
      const m = value?.match(new RegExp(`^\\s*${NUM}\\s*,\\s*${NUM}\\s*$`))
      if (m) return valid(Number(m[1]), Number(m[2]))
    }
  } catch {}

  const path = decoded.match(new RegExp(`/(?:search|dir|place)/${NUM},\\s*\\+?${NUM}`))
  if (path) return valid(Number(path[1]), Number(path[2]))

  const at = decoded.match(new RegExp(`@${NUM},${NUM}`))
  if (at) return valid(Number(at[1]), Number(at[2]))
  return undefined
}

/** Nazwa z /maps/place/<nazwa>/… */
export function nameFromMapsUrl(raw: string): string | undefined {
  const m = raw.match(/\/maps\/place\/([^/@?]+)/)
  if (!m?.[1]) return undefined
  try {
    const name = decodeURIComponent(m[1].replace(/\+/g, ' ')).trim()
    return name && !/^-?\d/.test(name) ? name : undefined
  } catch {
    return undefined
  }
}

/** Ekran zgody Google (UE) trzyma docelowy adres w `continue`. */
export function unwrapConsentUrl(raw: string): string {
  try {
    const url = new URL(raw)
    if (url.hostname === 'consent.google.com') return url.searchParams.get('continue') ?? raw
  } catch {}
  return raw
}

/** Nawigacja w aplikacji Google Maps (Android przekazuje ten link do aplikacji). */
export function navigationUrl({ lat, lng }: LatLng): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
}

/** Dekoduje przebieg trasy (Google i OSRM używają tego samego formatu) do par [lng, lat]. */
export function decodePolyline(encoded: string): [number, number][] {
  const points: [number, number][] = []
  let index = 0
  let lat = 0
  let lng = 0
  const next = () => {
    let shift = 0
    let result = 0
    let byte: number
    do {
      byte = encoded.charCodeAt(index++) - 63
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20)
    return result & 1 ? ~(result >> 1) : result >> 1
  }
  while (index < encoded.length) {
    lat += next()
    lng += next()
    points.push([lng / 1e5, lat / 1e5])
  }
  return points
}

/** Mapy Google z trasą komunikacją miejską między dwoma miejscami. */
export function transitUrl(from: LatLng, to: LatLng): string {
  return `https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lng}&destination=${to.lat},${to.lng}&travelmode=transit`
}

/** Link do miejsca: oryginalny z udostępnienia, a bez niego wyszukiwanie po współrzędnych/nazwie. */
export function placeUrl(location: {
  mapsUrl?: string
  lat?: number
  lng?: number
  name?: string
}): string {
  if (location.mapsUrl) return location.mapsUrl
  const query =
    location.lat !== undefined && location.lng !== undefined
      ? `${location.lat},${location.lng}`
      : (location.name ?? '')
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}

/** Kurs w stopniach (0 = północ), do obrotu strzałek trasy na mapie. */
export function bearing(a: LatLng, b: LatLng): number {
  const rad = Math.PI / 180
  const y = Math.sin((b.lng - a.lng) * rad) * Math.cos(b.lat * rad)
  const x =
    Math.cos(a.lat * rad) * Math.sin(b.lat * rad) -
    Math.sin(a.lat * rad) * Math.cos(b.lat * rad) * Math.cos((b.lng - a.lng) * rad)
  return (Math.atan2(y, x) / rad + 360) % 360
}

// ---------- mapa wyjazdu ----------

export type MappedCard = CardSnapshot & { location: NonNullable<CardSnapshot['location']> & LatLng }

export function hasCoords(card: CardSnapshot): card is MappedCard {
  return card.location?.lat !== undefined && card.location?.lng !== undefined
}

/**
 * Dlaczego karta nie ma pinezki:
 * - `address` — jest adres, ale bez współrzędnych (geokoder go nie znalazł),
 * - `link` — link z Map Google bez współrzędnych,
 * - `name` — tylko nazwa (samej nazwy nie geokodujemy: „Fig Tree House” to też dom w Londynie),
 * - `none` — zwiedzanie, jedzenie albo nocleg z dniem, ale bez miejsca.
 */
export type OffMapReason = 'address' | 'link' | 'name' | 'none'

// Typy, które z natury są miejscem; notatka i transport bez miejsca to nic dziwnego.
const PLACE_TYPES: ReadonlySet<CardSnapshot['type']> = new Set(['stay', 'sight', 'food'])

/** Powód braku pinezki; undefined, gdy karta jest na mapie albo nie musi na niej być. */
export function offMapReason(card: CardSnapshot): OffMapReason | undefined {
  if (hasCoords(card)) return undefined
  const location = card.location
  if (location?.address?.trim()) return 'address'
  if (location?.mapsUrl) return 'link'
  if (location?.name?.trim()) return 'name'
  // Pomysł bez miejsca to zwykły pomysł — nie ma czego szukać.
  return card.date && PLACE_TYPES.has(card.type) ? 'none' : undefined
}

export type DayRoute = {
  /**
   * Nocleg, w którym zaczyna się dzień — ten, w którym spaliście poprzedniej nocy. Pierwszy dzień
   * wyjazdu (przylot) nie ma startu: zaczyna się od pierwszej karty, a hotel jest zwykłym przystankiem.
   */
  start?: MappedCard
  /** Miejsca dnia z mapy w kolejności godzin (bez godziny na końcu). */
  stops: MappedCard[]
  /**
   * Nocleg na tę noc, gdy różni się od startu i nie jest już przystankiem (zmiana hotelu) — tam kończy
   * się dzień. Ostatni dzień (wylot) go nie ma.
   */
  end?: MappedCard
  /** Karty dnia bez współrzędnych — „poza mapą”. */
  offMap: CardSnapshot[]
}

export function dayRoute(cards: CardSnapshot[], date: string): DayRoute {
  // Pominięte karty nie są na trasie dnia.
  const live = cards.filter((c) => !c.deletedAt && !c.skipped)
  const day = live
    .filter((c) => c.date === date)
    .sort((a, b) => {
      if (a.time && b.time) return a.time.localeCompare(b.time)
      if (a.time || b.time) return a.time ? -1 : 1
      return a.createdAt.localeCompare(b.createdAt)
    })
  const stays = live.filter(hasCoords).filter((c) => c.type === 'stay')
  // Tak jak dojazdy na Liście (dayLegs): start w noclegu z poprzedniej nocy, koniec w noclegu tej nocy.
  const start = stays.find((s) => staysOver(s, addDays(date, -1)))
  const night = stays.find((s) => staysOver(s, date))
  const stops = day.filter(hasCoords).filter((c) => c.id !== start?.id)
  const end =
    night && night.id !== start?.id && !stops.some((c) => c.id === night.id) ? night : undefined
  return {
    start,
    stops,
    end,
    offMap: day.filter((c) => !hasCoords(c)),
  }
}

/** Zakładki dni mapy: wszystkie dni wyjazdu plus dni spoza zakresu, w których są miejsca. */
export function mapDays(
  cards: CardSnapshot[],
  trip: { startDate?: string | null; endDate?: string | null },
): { date: string; hasPlaces: boolean }[] {
  const live = cards.filter((c) => !c.deletedAt)
  const dates = new Set(
    trip.startDate ? dateRange(trip.startDate, trip.endDate ?? trip.startDate) : [],
  )
  for (const c of live) if (c.date && hasCoords(c)) dates.add(c.date)
  return [...dates].sort().map((date) => ({
    date,
    hasPlaces: live.some((c) => c.date === date && hasCoords(c)),
  }))
}

/** Najmniejszy odstęp środków sąsiednich pinezek w wachlarzu (px) — pinezka ma ok. 30 px. */
const FAN_GAP_PX = 38

/**
 * Przesunięcia (px względem punktu) pinezek rozsuniętych z jednego miejsca: do 6 — łuk nad punktem,
 * więcej — pełny okrąg. Promień rośnie tak, żeby sąsiednie pinezki na siebie nie wchodziły.
 */
export function fanOffsets(n: number): [number, number][] {
  if (n < 1) return []
  const arc = n <= 6
  const step = arc ? (n === 1 ? 0 : Math.min(50, 160 / (n - 1))) : 360 / n
  const rad = (deg: number) => (deg * Math.PI) / 180
  const r = step ? Math.max(44, FAN_GAP_PX / (2 * Math.sin(rad(step) / 2))) : 44
  const start = arc ? -90 - (step * (n - 1)) / 2 : -90
  return Array.from({ length: n }, (_, i) => {
    const a = rad(start + step * i)
    return [Math.round(r * Math.cos(a)), Math.round(r * Math.sin(a))]
  })
}

/** Miejsce z Google Places: współrzędne i adres (Place Details Essentials). */
export type GooglePlace = { id: string; lat: number; lng: number; address?: string }

/** Pierwsze ID miejsca z odpowiedzi Text Search (pole `places.id`). */
export function googlePlaceId(json: unknown): string | undefined {
  const id = (json as { places?: { id?: unknown }[] } | null)?.places?.[0]?.id
  return typeof id === 'string' && /^[\w-]{10,300}$/.test(id) ? id : undefined
}

/** Odpowiedź Place Details (`id,location,formattedAddress`) → miejsce; bez współrzędnych undefined. */
export function googlePlaceDetails(json: unknown): GooglePlace | undefined {
  const p = (json ?? {}) as {
    id?: unknown
    formattedAddress?: unknown
    location?: { latitude?: unknown; longitude?: unknown }
  }
  const lat = Number(p.location?.latitude)
  const lng = Number(p.location?.longitude)
  if (typeof p.id !== 'string' || !valid(lat, lng)) return undefined
  const address = typeof p.formattedAddress === 'string' ? p.formattedAddress.trim() : ''
  return { id: p.id, lat, lng, ...(address && { address }) }
}

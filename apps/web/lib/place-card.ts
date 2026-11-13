import { type CardType, createCard, findUrls, type LinkPreview } from '@planer/core'
import type * as Y from 'yjs'

export type Place = {
  name: string
  address?: string | null
  lat?: number | null
  lng?: number | null
  mapsUrl?: string | null
  note?: string | null
}

/** Karta z miejsca (udostępnione, wklejony link): nazwa jako tytuł, adres i notatka w treści. */
export function createPlaceCard(
  doc: Y.Doc,
  place: Place,
  extra: { type?: CardType; x?: number; y?: number; date?: string } = {},
): string {
  const location = {
    name: place.name,
    ...(place.address && { address: place.address }),
    ...(place.lat != null && place.lng != null && { lat: place.lat, lng: place.lng }),
    ...(place.mapsUrl && { mapsUrl: place.mapsUrl }),
  }
  return createCard(
    doc,
    {
      type: extra.type ?? 'sight',
      location,
      ...(extra.x !== undefined && { x: extra.x, y: extra.y }),
      ...(extra.date && { date: extra.date }),
    },
    new Date(),
    [place.name, place.address, place.note].filter(Boolean).join('\n'),
  )
}

/** Rozwija wklejony link Google Maps przez serwer; null, gdy to nie jest link do mapy. */
export async function resolvePastedPlace(
  text: string,
): Promise<(Place & { otherUrl?: string }) | null> {
  const res = await fetch('/api/maps/resolve', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  if (!res.ok) return null
  const place = (await res.json()) as Place & { otherUrl?: string }
  return place.mapsUrl ? place : null
}

/**
 * Karta ze schowka: link Google Maps → karta z miejscem (współrzędne z serwera), inny tekst → notatka.
 * Zwraca id karty albo null, gdy schowek pusty lub niedostępny.
 */
export async function pasteAsCard(
  doc: Y.Doc,
  at?: { x: number; y: number },
): Promise<string | null> {
  const text = (await navigator.clipboard?.readText().catch(() => ''))?.trim()
  if (!text) return null
  const place = await resolvePastedPlace(text).catch(() => null)
  if (place) return createPlaceCard(doc, place, at)
  const url = findUrls(text)[0]
  if (url) return createLinkCard(doc, url, at)
  return createCard(doc, { type: 'note', ...at }, new Date(), text)
}

/** Karta z linku: podgląd Open Graph z serwera (bez sieci — sam adres, podgląd przy następnej okazji). */
export async function createLinkCard(
  doc: Y.Doc,
  url: string,
  at?: { x: number; y: number },
): Promise<string> {
  const preview: LinkPreview = await fetch('/api/link-preview', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url }),
  })
    .then((r): Promise<LinkPreview> | LinkPreview => (r.ok ? r.json() : { url }))
    .catch((): LinkPreview => ({ url }))
  return createCard(
    doc,
    { type: 'note', linkPreview: preview, ...at },
    new Date(),
    [preview.title ?? new URL(url).hostname, preview.description].filter(Boolean).join('\n'),
  )
}

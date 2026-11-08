'use client'

import type { LatLng } from '@planer/core'
import { MAP_STYLES } from '@/components/map/map-style'
import { tilesForPlaces } from './map-tiles'

// Mapa wyjazdu bez zasięgu: style, czcionki, sprite i kafelki OpenFreeMap w pamięci `map-tiles`,
// z której czyta service worker (app/sw.ts). Pobieranie po kilka plików naraz, z przerwami.

export const MAP_CACHE = 'map-tiles'
const KEY = (tripId: string) => `planer-offline-map-${tripId}`
const PARALLEL = 4
const PAUSE_MS = 15
// Zakresy znaków dla łaciny z ogonkami (polski, portugalski…), cyrylicy i greki.
const GLYPH_RANGES = ['0-255', '256-511', '512-767', '768-1023', '1024-1279']
// Średni rozmiar kafelka wektorowego — do szacunku przed pobraniem.
const TILE_KB = 28

export type OfflineMapInfo = { files: number; bytes: number; at: string; places: number }

export function readOfflineMap(tripId: string): OfflineMapInfo | null {
  try {
    return JSON.parse(localStorage.getItem(KEY(tripId)) ?? 'null') as OfflineMapInfo | null
  } catch {
    return null
  }
}

export function estimate(places: LatLng[]): { tiles: number; mb: number } {
  const tiles = tilesForPlaces(places).length
  return { tiles, mb: Math.max(1, Math.round((tiles * TILE_KB) / 1024)) }
}

type Style = {
  sources: Record<string, { url?: string; tiles?: string[]; maxzoom?: number }>
  glyphs?: string
  sprite?: string
  layers: { layout?: { 'text-font'?: unknown } }[]
}

/** Wszystkie adresy do pobrania: style obu motywów i to, czego używają, plus kafelki miejsc. */
async function plan(places: LatLng[]): Promise<string[]> {
  const urls = new Set<string>()
  const styles = await Promise.all(
    Object.values(MAP_STYLES).map(async (url) => {
      urls.add(url)
      return (await (await fetch(url)).json()) as Style
    }),
  )
  const tiles = tilesForPlaces(places)
  for (const style of styles) {
    for (const source of Object.values(style.sources)) {
      let templates = source.tiles ?? []
      let maxzoom = source.maxzoom ?? 14
      if (source.url) {
        urls.add(source.url)
        const tileJson = (await (await fetch(source.url)).json()) as {
          tiles: string[]
          maxzoom?: number
        }
        templates = tileJson.tiles
        maxzoom = tileJson.maxzoom ?? maxzoom
      }
      for (const template of templates)
        for (const t of tiles)
          if (t.z <= maxzoom)
            urls.add(
              template
                .replace('{z}', String(t.z))
                .replace('{x}', String(t.x))
                .replace('{y}', String(t.y)),
            )
    }
    if (style.sprite)
      for (const suffix of ['.json', '.png', '@2x.json', '@2x.png']) urls.add(style.sprite + suffix)
    const fonts = new Set<string>()
    for (const layer of style.layers) {
      const font = layer.layout?.['text-font']
      if (Array.isArray(font) && font.every((f) => typeof f === 'string'))
        fonts.add((font as string[]).join(','))
    }
    if (style.glyphs)
      for (const font of fonts)
        for (const range of GLYPH_RANGES)
          urls.add(
            (style.glyphs as string)
              .replace('{fontstack}', encodeURIComponent(font))
              .replace('{range}', range),
          )
  }
  return [...urls]
}

/**
 * Pobiera mapę dla miejsc wyjazdu. Pliki już zapisane pomija, więc przerwane pobieranie wznawia
 * się od miejsca przerwania. Zwraca stan zapisany też w localStorage.
 */
export async function downloadOfflineMap(
  tripId: string,
  places: LatLng[],
  onProgress: (done: number, total: number) => void,
  signal: AbortSignal,
): Promise<OfflineMapInfo> {
  const urls = await plan(places)
  const cache = await caches.open(MAP_CACHE)
  let done = 0
  let bytes = 0
  let next = 0
  const worker = async () => {
    while (next < urls.length && !signal.aborted) {
      const url = urls[next++] as string
      const cached = await cache.match(url)
      if (cached) bytes += Number(cached.headers.get('content-length') ?? 0)
      else {
        const res = await fetch(url, { signal })
        if (res.ok) {
          const blob = await res.clone().blob()
          bytes += blob.size
          await cache.put(url, res)
        }
        await new Promise((r) => setTimeout(r, PAUSE_MS))
      }
      onProgress(++done, urls.length)
    }
  }
  await Promise.all(Array.from({ length: PARALLEL }, worker))
  if (signal.aborted) throw new DOMException('przerwano', 'AbortError')
  const info = { files: urls.length, bytes, at: new Date().toISOString(), places: places.length }
  try {
    localStorage.setItem(KEY(tripId), JSON.stringify(info))
  } catch {}
  return info
}

/** Usuwa mapę offline (pamięć jest wspólna dla wyjazdów — znika całość). */
export async function clearOfflineMap(tripId: string) {
  await caches.delete(MAP_CACHE)
  try {
    for (const key of Object.keys(localStorage))
      if (key.startsWith('planer-offline-map-') || key === KEY(tripId)) localStorage.removeItem(key)
  } catch {}
}

'use client'

import type { Map as MapLibreMap } from 'maplibre-gl'

/**
 * Jedna mapa na wyjazd, poza cyklem życia widoku. Wyjście z Mapy odpina jej element od strony,
 * a powrót przypina go z powrotem — bez nowego kontekstu WebGL, stylu i kafelków, z tym samym
 * kadrem i zakładką dnia. Inny wyjazd niszczy poprzednią mapę.
 */
export type CachedMap = {
  tripId: string
  element: HTMLDivElement
  map: MapLibreMap
  style: string | object
  tab: string
}

let cached: CachedMap | null = null

export function takeMap(tripId: string): CachedMap | null {
  if (cached && cached.tripId !== tripId) {
    cached.map.remove()
    cached = null
  }
  const found = cached
  cached = null
  return found
}

export function keepMap(entry: CachedMap) {
  if (cached && cached !== entry) cached.map.remove()
  entry.element.remove()
  cached = entry
}

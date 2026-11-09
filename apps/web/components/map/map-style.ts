'use client'

import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'

// Kafelki OpenFreeMap (OSM, bez klucza): stonowany jasny i ciemny styl pod motyw Vague.
export const MAP_STYLES = {
  light: 'https://tiles.openfreemap.org/styles/positron',
  dark: 'https://tiles.openfreemap.org/styles/dark',
} as const

export function useMapStyle(): string {
  const { resolvedTheme } = useTheme()
  const [style, setStyle] = useState<string>(MAP_STYLES.light)
  useEffect(
    () => setStyle(resolvedTheme === 'dark' ? MAP_STYLES.dark : MAP_STYLES.light),
    [resolvedTheme],
  )
  return style
}

/** Wartość tokenu motywu (np. --accent) do warstw mapy, które nie rozumieją zmiennych CSS. */
export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#c48282'
}

/** Mieszanka dwóch kolorów #rrggbb; `share` to udział pierwszego. */
function mix(a: string, b: string, share: number): string {
  const channel = (hex: string, i: number) => Number.parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16)
  const value = (i: number) =>
    Math.round(channel(a, i) * share + channel(b, i) * (1 - share))
      .toString(16)
      .padStart(2, '0')
  return `#${value(0)}${value(1)}${value(2)}`
}

const PLACES = ['other', 'suburb', 'village', 'town', 'city', 'city_large', 'state'].map(
  (p) => `place_${p}`,
)
const COUNTRIES = ['other', 'minor', 'major'].map((p) => `place_country_${p}`)

/** Kolory ciemnej mapy z tokenów motywu: gotowy styl ma prawie czarne tło i ginie w panelu. */
function darkPaint(): Record<string, Record<string, string>> {
  const panel = cssVar('--panel')
  const sel = cssVar('--sel')
  const line = cssVar('--line')
  const water = mix(cssVar('--blue'), panel, 0.4)
  const green = mix(cssVar('--green'), panel, 0.2)
  const road = mix(cssVar('--muted'), panel, 0.45)
  const label = { 'text-color': cssVar('--muted'), 'text-halo-color': panel }
  const roads = Object.fromEntries(
    [
      'highway_major_inner',
      'highway_major_subtle',
      'highway_motorway_inner',
      'highway_motorway_subtle',
    ].map((id) => [id, { 'line-color': road }]),
  )
  const casings = Object.fromEntries(
    ['highway_major_casing', 'highway_motorway_casing'].map((id) => [id, { 'line-color': sel }]),
  )
  const rails = Object.fromEntries(
    ['railway', 'railway_minor', 'railway_transit'].flatMap((id) => [
      [id, { 'line-color': sel }],
      [`${id}_dashline`, { 'line-color': panel }],
    ]),
  )
  return {
    background: { 'background-color': panel },
    landuse_residential: { 'fill-color': cssVar('--raised') },
    water: { 'fill-color': water },
    waterway: { 'line-color': water },
    water_name: { 'text-color': cssVar('--blue'), 'text-halo-color': panel },
    landcover_wood: { 'fill-color': green },
    landuse_park: { 'fill-color': green },
    building: { 'fill-color': line, 'fill-outline-color': sel },
    'aeroway-area': { 'fill-color': cssVar('--raised') },
    'aeroway-runway': { 'line-color': sel },
    'aeroway-runway-casing': { 'line-color': line },
    'aeroway-taxiway': { 'line-color': sel },
    highway_path: { 'line-color': sel },
    highway_minor: { 'line-color': sel },
    ...roads,
    ...casings,
    ...rails,
    highway_name_other: { 'text-color': cssVar('--subtle'), 'text-halo-color': panel },
    highway_name_motorway: { 'text-color': cssVar('--subtle') },
    ...Object.fromEntries([...PLACES, ...COUNTRIES].map((id) => [id, label])),
  }
}

/**
 * Motyw mapy: po każdym wczytaniu stylu (także po zmianie motywu) maluje warstwy. `quiet` chowa
 * strzałki jednokierunkowe, które w małej mapce są tylko szumem.
 */
export function themeMap(map: import('maplibre-gl').Map, { quiet = false } = {}) {
  map.on('style.load', () => {
    polishLabels(map)
    if (quiet) {
      for (const id of ['road_oneway', 'road_oneway_opposite'])
        if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none')
    }
    if (document.documentElement.dataset.theme !== 'dark') return
    for (const [id, paint] of Object.entries(darkPaint())) {
      if (!map.getLayer(id)) continue
      for (const [key, value] of Object.entries(paint))
        map.setPaintProperty(id, key as Parameters<typeof map.setPaintProperty>[1], value)
    }
  })
}

/** Nazwy na mapie po polsku, gdy OpenStreetMap je zna; inaczej łacińskie, na końcu lokalne. */
function polishLabels(map: import('maplibre-gl').Map) {
  for (const layer of map.getStyle().layers ?? []) {
    if (layer.type !== 'symbol') continue
    const field = map.getLayoutProperty(layer.id, 'text-field')
    // Tylko warstwy z nazwami miejsc (numery dróg i domów zostają).
    if (!field || !JSON.stringify(field).includes('name')) continue
    map.setLayoutProperty(layer.id, 'text-field', [
      'coalesce',
      ['get', 'name:pl'],
      ['get', 'name:latin'],
      ['get', 'name'],
    ])
  }
}

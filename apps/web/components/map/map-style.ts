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

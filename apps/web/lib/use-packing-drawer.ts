'use client'

import { useSearchParams } from 'next/navigation'

/**
 * Lista pakowania w parametrze `?packing`: otwiera się nad każdym widokiem wyjazdu, a systemowe
 * „wstecz” ją zamyka. Jak arkusz karty: natywne history.pushState, żeby działało offline.
 */
const PARAM = 'packing'

/** Drawer otwarty z tej strony (a nie wejście z linku) — wtedy zamknięcie to „wstecz”. */
let openedHere = false

function urlWith(open: boolean): string {
  const params = new URLSearchParams(window.location.search)
  if (open) params.set(PARAM, '1')
  else params.delete(PARAM)
  const query = params.toString()
  return `${window.location.pathname}${query ? `?${query}` : ''}`
}

export function openPacking() {
  if (new URLSearchParams(window.location.search).has(PARAM)) return
  openedHere = true
  window.history.pushState(null, '', urlWith(true))
}

export function closePacking() {
  if (openedHere) {
    openedHere = false
    window.history.back()
  } else window.history.replaceState(null, '', urlWith(false))
}

export function usePackingOpen(): boolean {
  return useSearchParams().has(PARAM)
}

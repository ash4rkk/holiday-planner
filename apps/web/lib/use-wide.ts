'use client'

import { useSyncExternalStore } from 'react'

const WIDE = '(min-width: 1024px)'

function subscribe(onChange: () => void) {
  const query = window.matchMedia(WIDE)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

/** Szeroki ekran (`lg`): panele z boku i rozgałęzione warianty. Decyduje szerokość, nie urządzenie. */
export function useWide(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(WIDE).matches,
    () => false,
  )
}

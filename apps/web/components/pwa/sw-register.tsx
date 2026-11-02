'use client'

import { SerwistProvider } from '@serwist/turbopack/react'
import type { ReactNode } from 'react'

/** Rejestracja SW tylko w buildzie produkcyjnym (w dev cache przeszkadza w pracy). */
export function ServiceWorker({ children }: { children: ReactNode }) {
  return (
    <SerwistProvider
      swUrl="/serwist/sw.js"
      disable={process.env.NODE_ENV !== 'production'}
      // Po powrocie sieci Yjs sam dosyła zmiany — przeładowanie przerwałoby edycję.
      reloadOnOnline={false}
      // Klasyczny worker: przeglądarka pobiera go z cookie Cloudflare Access (moduł — bez cookie,
      // więc za Access rejestracja kończyłaby się 401). Zbudowany plik nie ma import/export.
      options={{ type: 'classic' }}
    >
      {children}
    </SerwistProvider>
  )
}

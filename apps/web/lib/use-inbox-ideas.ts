'use client'

import type { InboxItem } from '@planer/core/db'
import { useEffect } from 'react'
import type * as Y from 'yjs'
import { createPlaceCard } from '@/lib/place-card'

const EVERY_MS = 60_000

/**
 * Udostępnione miejsca („Udostępnij → Planer”) trafiają prosto do pomysłów: otwarty wyjazd odbiera je
 * z serwera (przy wejściu, po powrocie do aplikacji i co minutę) i tworzy karty bez dnia.
 */
export function useInboxIdeas(tripId: string, doc: Y.Doc, ready: boolean) {
  useEffect(() => {
    if (!ready) return
    let busy = false
    const claim = async () => {
      if (busy || !navigator.onLine || document.visibilityState !== 'visible') return
      busy = true
      try {
        const res = await fetch(`/api/inbox/claim?tripId=${tripId}`, { method: 'POST' })
        if (!res.ok) return
        const items = (await res.json()) as InboxItem[]
        for (const item of items) createPlaceCard(doc, item)
      } catch {
        // brak sieci — spróbujemy przy następnej okazji
      } finally {
        busy = false
      }
    }
    void claim()
    const timer = setInterval(() => void claim(), EVERY_MS)
    const onVisible = () => void claim()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onVisible)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onVisible)
    }
  }, [tripId, doc, ready])
}

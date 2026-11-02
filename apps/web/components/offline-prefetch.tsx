'use client'

import { useEffect } from 'react'
import { prefetchTripFiles } from '@/lib/offline-files'

/** Pliki aktywnego wyjazdu do pamięci offline: po starcie i po powrocie sieci. */
export function OfflinePrefetch({ tripId }: { tripId?: string }) {
  useEffect(() => {
    if (!tripId) return
    const run = () => void prefetchTripFiles(tripId)
    run()
    window.addEventListener('online', run)
    return () => window.removeEventListener('online', run)
  }, [tripId])
  return null
}

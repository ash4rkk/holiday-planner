'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { flushOutbox } from '@/lib/outbox'

/** Po starcie i po powrocie sieci wysyła udostępnienia zapisane offline. */
export function OutboxFlusher() {
  const router = useRouter()
  useEffect(() => {
    const flush = () =>
      void flushOutbox()
        // Bez odświeżania przy otwartej karcie (?card=) — psuje to późniejsze zmiany adresu przez history API.
        .then(
          (sent) =>
            sent > 0 &&
            !new URLSearchParams(window.location.search).has('card') &&
            router.refresh(),
        )
        .catch(() => {})
    flush()
    window.addEventListener('online', flush)
    return () => window.removeEventListener('online', flush)
  }, [router])
  return null
}

'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { useRef, useState } from 'react'

/**
 * Otwarta karta w parametrze `?card=<id>`: link do karty działa z każdego widoku, a systemowe
 * „wstecz” zamyka arkusz otwarty z widoku.
 *
 * Natywne history.pushState zamiast routera Next: zmiana parametru nie idzie do serwera, więc
 * karty otwierają się także offline (Next synchronizuje to z useSearchParams).
 */
export function useCardSheet() {
  const pathname = usePathname()
  const openId = useSearchParams().get('card')
  const openedHere = useRef(false)
  const [newId, setNewId] = useState<string | null>(null)

  const open = (id: string, isNew = false) => {
    if (isNew) setNewId(id)
    openedHere.current = true
    window.history.pushState(null, '', `${pathname}?card=${encodeURIComponent(id)}`)
  }

  const close = () => {
    setNewId(null)
    if (openedHere.current) {
      openedHere.current = false
      window.history.back()
    } else window.history.replaceState(null, '', pathname)
  }

  return { openId, isNew: openId !== null && openId === newId, open, close }
}

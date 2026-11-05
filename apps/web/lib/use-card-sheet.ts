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
let pendingBack: Promise<void> = Promise.resolve()

export function useCardSheet() {
  const pathname = usePathname()
  const openId = useSearchParams().get('card')
  const openedHere = useRef(false)
  const [newId, setNewId] = useState<string | null>(null)

  const open = (id: string, isNew = false) => {
    if (isNew) setNewId(id)
    // history.back() z zamknięcia kończy się asynchronicznie — gdyby nowa karta weszła wcześniej,
    // spóźnione „wstecz” zdjęłoby właśnie ją.
    void pendingBack.then(() => {
      const url = `${pathname}?card=${encodeURIComponent(id)}`
      // Przy otwartym panelu kolejna karta zastępuje poprzednią: „wstecz” ma zamknąć panel.
      if (new URLSearchParams(window.location.search).has('card'))
        window.history.replaceState(null, '', url)
      else {
        openedHere.current = true
        window.history.pushState(null, '', url)
      }
    })
  }

  const close = () => {
    setNewId(null)
    if (openedHere.current) {
      openedHere.current = false
      pendingBack = new Promise<void>((resolve) => {
        window.addEventListener('popstate', () => resolve(), { once: true })
        // Zapas, gdyby popstate nie przyszło (np. brak wpisu w historii).
        setTimeout(resolve, 500)
      })
      window.history.back()
    } else window.history.replaceState(null, '', pathname)
  }

  return { openId, isNew: openId !== null && openId === newId, open, close }
}

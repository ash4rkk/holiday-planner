'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useRef, useState } from 'react'

/**
 * Otwarta karta w parametrze `?card=<id>`: link do karty działa z każdego widoku, a systemowe
 * „wstecz” zamyka arkusz otwarty z widoku.
 */
export function useCardSheet() {
  const router = useRouter()
  const pathname = usePathname()
  const openId = useSearchParams().get('card')
  const openedHere = useRef(false)
  const [newId, setNewId] = useState<string | null>(null)

  const open = (id: string, isNew = false) => {
    if (isNew) setNewId(id)
    openedHere.current = true
    router.push(`${pathname}?card=${id}`, { scroll: false })
  }

  const close = () => {
    setNewId(null)
    if (openedHere.current) {
      openedHere.current = false
      router.back()
    } else router.replace(pathname, { scroll: false })
  }

  return { openId, isNew: openId !== null && openId === newId, open, close }
}

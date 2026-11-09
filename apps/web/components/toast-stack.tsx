'use client'

import { type ReactNode, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useHideWhenInactive } from '@/lib/use-hide-when-inactive'

export const TOAST_STACK = 'toast-stack'

/** Miejsce na komunikaty nad menu dolnym; kolejne układają się jeden nad drugim, a nie na sobie. */
export function ToastStack() {
  return (
    <div
      id={TOAST_STACK}
      className="pointer-events-none fixed inset-x-1 bottom-[calc(76px+env(safe-area-inset-bottom))] z-(--z-toast) flex flex-col-reverse items-center gap-1 [&>*]:pointer-events-auto [&>*]:shadow-float"
    />
  )
}

/** Komunikat w stosie nad menu dolnym. */
export function Toast({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  useHideWhenInactive(ref)
  // Sprzątanie ważne przy ukrytych widokach (router trzyma je w <Activity>): inaczej komunikat
  // z ukrytego widoku stałby w stosie obok tego z widocznego.
  useEffect(() => {
    setSlot(document.getElementById(TOAST_STACK))
    return () => setSlot(null)
  }, [])
  return slot ? createPortal(<div ref={ref}>{children}</div>, slot) : null
}

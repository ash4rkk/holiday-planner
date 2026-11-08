'use client'

import { type RefObject, useEffect, useRef } from 'react'

/**
 * Zamykanie okienek i menu jednym sposobem: Esc zawsze, a z `ref` także dotknięcie poza nim.
 * Dotknięcie liczy się na `pointerdown`, więc puszczenie palca, które menu otworzyło, go nie zamyka.
 */
export function useDismiss(
  active: boolean,
  onClose: () => void,
  ref?: RefObject<HTMLElement | null>,
) {
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    if (!active) return
    const escape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      close.current()
    }
    const outside = (e: PointerEvent) => {
      if (ref?.current && !ref.current.contains(e.target as Node)) close.current()
    }
    document.addEventListener('keydown', escape)
    if (ref) document.addEventListener('pointerdown', outside)
    return () => {
      document.removeEventListener('keydown', escape)
      document.removeEventListener('pointerdown', outside)
    }
  }, [active, ref])
}

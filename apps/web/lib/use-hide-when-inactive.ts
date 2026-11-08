'use client'

import { type RefObject, useLayoutEffect } from 'react'

/**
 * Portale (np. „+” w menu dolnym, komunikaty) z widoku, który router schował w <Activity>, nie są
 * ukrywane razem z nim, a aktualizacje ukrytego widoku przychodzą z opóźnieniem. Efekty układu
 * znikają przy ukryciu synchronicznie — więc tu chowamy element od razu i pokazujemy po powrocie.
 */
export function useHideWhenInactive(ref: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const el = ref.current
    if (el) el.style.display = ''
    return () => {
      if (el) el.style.display = 'none'
    }
  })
}

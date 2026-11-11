'use client'

import { type RefObject, useLayoutEffect, useRef } from 'react'

/**
 * Portale (np. „+” w menu dolnym, komunikaty) z widoku, który router schował w <Activity>, nie są
 * ukrywane razem z nim, a aktualizacje ukrytego widoku przychodzą z opóźnieniem. Efekty układu
 * znikają przy ukryciu synchronicznie — więc tu chowamy element od razu i pokazujemy po powrocie.
 *
 * Chowanie tylko przy zwinięciu (efekt bez zależności nie ma sprzątania): gdyby sprzątał przy każdym
 * renderze, element na chwilę dostawałby `display: none`, a to restartuje animacje CSS — panel karty
 * „wjeżdżał” od nowa przy każdym najechaniu na kartę Tablicy.
 */
export function useHideWhenInactive(ref: RefObject<HTMLElement | null>) {
  const last = useRef<HTMLElement | null>(null)
  // Element bywa podpięty dopiero w kolejnym renderze (portal po zamontowaniu), więc przy każdym.
  useLayoutEffect(() => {
    const el = ref.current
    last.current = el
    if (el && el.style.display === 'none') el.style.display = ''
  })
  useLayoutEffect(
    () => () => {
      if (last.current) last.current.style.display = 'none'
    },
    [],
  )
}

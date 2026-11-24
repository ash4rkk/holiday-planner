'use client'

import { type RefObject, useLayoutEffect, useRef } from 'react'
import { reducedMotion } from '@/lib/motion'

type Box = { left: number; top: number; width: number; height: number }

const boxOf = (el: HTMLElement, origin: DOMRect): Box => {
  const r = el.getBoundingClientRect()
  return { left: r.left - origin.left, top: r.top - origin.top, width: r.width, height: r.height }
}

/**
 * Wybrana pozycja menu: jedna pigułka jedzie sprężyną do nowej pozycji, a pozycje płynnie zmieniają
 * szerokość (nazwa się zwija i rozwija). W spoczynku tło ma sama pozycja, więc zmiana szerokości
 * ekranu niczego nie rozjeżdża. Złapana w połowie drogi rusza z miejsca, w którym jest.
 */
export function useNavPill(
  nav: RefObject<HTMLElement | null>,
  pill: RefObject<HTMLElement | null>,
  active: string | undefined,
) {
  const last = useRef<{ active: string | undefined; box: Box | null; widths: Map<string, number> }>(
    {
      active: undefined,
      box: null,
      widths: new Map(),
    },
  )

  useLayoutEffect(() => {
    const root = nav.current
    const mark = pill.current
    if (!root || !mark) return
    const links = [...root.querySelectorAll<HTMLElement>('[data-nav]')]
    const target = links.find((l) => l.dataset.nav === active)
    const prev = last.current
    const origin = root.getBoundingClientRect()

    // Bieżące miejsca: w locie z ekranu, w spoczynku te sprzed zmiany.
    const flying = mark.getAnimations().length > 0
    const from = flying ? boxOf(mark, origin) : prev.box
    const widths = new Map(
      links.map((l) => [
        l,
        l.getAnimations().some((a) => a.id === 'nav-width')
          ? l.getBoundingClientRect().width
          : prev.widths.get(l.dataset.nav ?? ''),
      ]),
    )
    const moved = prev.active !== undefined && prev.active !== active
    if (moved || !active) {
      for (const el of [mark, ...links])
        for (const a of el.getAnimations()) if (a.id.startsWith('nav-')) a.cancel()
    }

    const save = () => {
      last.current = {
        active,
        box: target ? boxOf(target, origin) : null,
        widths: new Map(links.map((l) => [l.dataset.nav ?? '', l.offsetWidth])),
      }
    }
    if (!moved) {
      // Ta sama pozycja: zapamiętaj spoczynek, ale nie miary z połowy ruchu.
      if (!flying) save()
      return
    }
    save()
    const to = last.current.box
    if (!to || !from || !target || reducedMotion()) return

    const css = getComputedStyle(document.documentElement)
    const easing = css.getPropertyValue('--spring-snappy').trim()
    const duration = Number.parseFloat(css.getPropertyValue('--spring-snappy-ms'))
    const timing = { duration, easing }
    for (const l of links) {
      const was = widths.get(l)
      if (was !== undefined && Math.abs(was - l.offsetWidth) > 1)
        l.animate({ width: [`${was}px`, `${l.offsetWidth}px`] }, { ...timing, id: 'nav-width' })
      // Tło niesie pigułka, dopóki jedzie.
      l.animate({ backgroundColor: ['transparent', 'transparent'] }, { duration, id: 'nav-bg' })
    }
    const frame = (b: Box) => ({
      opacity: 1,
      left: `${b.left}px`,
      top: `${b.top}px`,
      width: `${b.width}px`,
      height: `${b.height}px`,
    })
    mark.animate([frame(from), frame(to)], { ...timing, id: 'nav-pill' })
  })
}

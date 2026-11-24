'use client'

import { type RefObject, useLayoutEffect, useRef } from 'react'
import { reducedMotion, springTiming } from '@/lib/motion'

type Box = { left: number; top: number; width: number; height: number }
type Rest = {
  active: string | undefined
  pill: Box | null
  islands: Box[]
  links: Map<string, number>
  label: { box: Box; text: string } | null
}

/** Trochę wolniej niż przyciski i bez odbicia: długa droga przez cały ekran. */
const TIMING = { duration: 0.45, bounce: 0 }
/** Szerokość zaokrąglonego końca wysepki (połowa jej wysokości); środek nachodzi na nie o 1 px. */
const CAP = 27

const boxOf = (el: Element, origin: DOMRect): Box => {
  const r = el.getBoundingClientRect()
  return { left: r.left - origin.left, top: r.top - origin.top, width: r.width, height: r.height }
}

/**
 * Zmiana pozycji w menu: pigułka jedzie do nowej, wysepki zmieniają szerokość, ikony się przesuwają.
 *
 * Wszystko samym `transform` i `opacity`, więc jedzie w kompozytorze: wątek jest wtedy zajęty
 * rysowaniem nowego widoku i animacja szerokości by się rwała. Docelowy układ wchodzi od razu, a
 * elementy dojeżdżają do niego z poprzednich miejsc. Na czas ruchu tło wysepek i wybranej pozycji
 * przejmują osobne elementy (wysepka z trzech kawałków, żeby skalowanie nie psuło zaokrągleń).
 * Przerwane w połowie rusza z miejsca, w którym jest.
 */
export function useNavPill(
  nav: RefObject<HTMLElement | null>,
  pill: RefObject<HTMLElement | null>,
  active: string | undefined,
) {
  const rest = useRef<Rest | null>(null)

  useLayoutEffect(() => {
    const root = nav.current
    const mark = pill.current
    if (!root || !mark) return
    const links = [...root.querySelectorAll<HTMLElement>('[data-nav]')]
    const islands = [...root.querySelectorAll<HTMLElement>('[data-island]')]
    const skins = [...root.querySelectorAll<HTMLElement>('[data-skin]')]
    const target = links.find((l) => l.dataset.nav === active)
    const origin = root.getBoundingClientRect()
    const prev = rest.current
    const moved = prev !== null && prev.active !== active
    const flying = mark.getAnimations().length > 0
    if (!moved && flying) return

    // Bieżące miejsca: w locie z ekranu, w spoczynku te sprzed zmiany.
    const from = flying
      ? {
          pill: boxOf(mark, origin),
          islands: skins.map((s) => {
            const l = boxOf(s.children[1] as Element, origin)
            const r = boxOf(s.children[3] as Element, origin)
            return { ...l, width: r.left + r.width - l.left }
          }),
          links: new Map(links.map((l) => [l.dataset.nav ?? '', boxOf(l, origin).left])),
        }
      : prev

    const moving = [mark, ...links, ...islands, ...skins, ...skins.flatMap((s) => [...s.children])]
    for (const el of moving)
      for (const a of el.getAnimations()) if (a.id.startsWith('nav-')) a.cancel()

    const label = target?.querySelector('span')
    const now: Rest = {
      active,
      pill: target ? boxOf(target, origin) : null,
      islands: islands.map((i) => boxOf(i, origin)),
      links: new Map(links.map((l) => [l.dataset.nav ?? '', boxOf(l, origin).left])),
      label: label ? { box: boxOf(label, origin), text: label.textContent ?? '' } : null,
    }
    rest.current = now
    if (!moved || !from?.pill || !now.pill || !target || reducedMotion()) return

    const timing = springTiming(TIMING)
    const run = (el: Element, first: Keyframe, last: Keyframe, id = 'nav-move') =>
      el.animate([first, last], { ...timing, id })
    const hold = (el: Element, style: Keyframe) => run(el, style, style, 'nav-hold')
    const slide = (dx: number, scale = 1) => `translateX(${dx}px) scaleX(${scale})`

    // Pigułka; tło wybranej pozycji wraca, gdy dojedzie, a poprzedniej nie gaśnie osobno.
    const p = now.pill
    Object.assign(mark.style, {
      left: `${p.left}px`,
      top: `${p.top}px`,
      width: `${p.width}px`,
      height: `${p.height}px`,
    })
    run(
      mark,
      {
        opacity: 1,
        transform: slide(from.pill.left - p.left, from.pill.width / p.width),
      },
      { opacity: 1, transform: slide(0) },
      'nav-pill',
    )
    for (const l of links) hold(l, { backgroundColor: 'transparent' })

    islands.forEach((island, i) => {
      const skin = skins[i]
      const to = now.islands[i]
      const was = from.islands[i]
      if (!skin || !to || !was) return
      Object.assign(skin.style, {
        left: `${to.left}px`,
        top: `${to.top}px`,
        width: `${to.width}px`,
        height: `${to.height}px`,
      })
      const [shadow, left, middle, right] = [...skin.children]
      if (!shadow || !left || !middle || !right) return
      const dl = was.left - to.left
      const dr = was.left + was.width - to.left - to.width
      const core = (b: Box) => b.width - 2 * CAP + 2
      hold(skin, { opacity: 1 })
      hold(island, {
        backgroundColor: 'transparent',
        borderColor: 'transparent',
        boxShadow: 'none',
      })
      run(shadow, { transform: slide(dl, was.width / to.width) }, { transform: slide(0) })
      run(left, { transform: slide(dl) }, { transform: slide(0) })
      run(middle, { transform: slide(dl, core(was) / core(to)) }, { transform: slide(0) })
      run(right, { transform: slide(dr) }, { transform: slide(0) })
    })

    for (const l of links) {
      const id = l.dataset.nav ?? ''
      const dx = (from.links.get(id) ?? 0) - (now.links.get(id) ?? 0)
      if (Math.abs(dx) > 0.5) run(l, { transform: slide(dx) }, { transform: slide(0) })
    }

    // Nazwa pojawia się, gdy pigułka już się zbliża; poprzednia gaśnie tam, gdzie była.
    label?.animate(
      { opacity: [0, 1] },
      { duration: 180, delay: 90, easing: 'ease-out', fill: 'backwards', id: 'nav-label' },
    )
    if (prev?.label && !flying) {
      const old = document.createElement('span')
      old.textContent = prev.label.text
      old.setAttribute('aria-hidden', 'true')
      old.className =
        'pointer-events-none absolute text-sm font-bold whitespace-nowrap text-accent opacity-0'
      old.style.left = `${prev.label.box.left}px`
      old.style.top = `${prev.label.box.top}px`
      root.append(old)
      old.animate({ opacity: [1, 0] }, { duration: 120, easing: 'ease-out' })
      setTimeout(() => old.remove(), 200)
    }
  })
}

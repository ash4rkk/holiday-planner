'use client'

import { type PointerEvent, type RefObject, useCallback, useEffect, useRef, useState } from 'react'
import { crossfade, reducedMotion, SpringMotion } from './motion'
import { EXIT, release, rubber, SMOOTH, snapIndex, VelocityTracker } from './spring'

/** Wyjście panelu bocznego (szeroki ekran, klasa `panel-out`). */
const PANEL_OUT_MS = 190

type Options = {
  /** Arkusz z dołu (telefon); bez niego to panel boczny, który tylko wychodzi klasą `panel-out`. */
  enabled: boolean
  /** Wysokości, w których arkusz może stać, jako część ekranu, od najwyższej. */
  detents?: readonly number[]
  /** Która z nich teraz obowiązuje. */
  rest?: number
  onRest?: (index: number) => void
  onClose: () => void
}

const SINGLE = [1] as const

/**
 * Arkusz z dołu na sprężynie: wjazd, pociągnięcie za uchwyt, zmiana wysokości i zamknięcie to jeden
 * ciągły ruch, który można złapać w każdej chwili. Tło ściemnia się razem z położeniem arkusza.
 *
 * W ruchu arkusz ma najwyższą wysokość i jest przesunięty (`transform`); w spoczynku wraca do
 * wysokości z klasy i bez `transform`, bo ten zmieniałby układ dla elementów `fixed` w środku
 * (pasek formatowania, podgląd załącznika).
 */
export function useSheet(options: Options) {
  const opts = useRef(options)
  opts.current = options
  const [closing, setClosing] = useState(false)

  const ctl = useRef<ReturnType<typeof controller> | null>(null)
  ctl.current ??= controller(opts, setClosing)
  const c = ctl.current

  useEffect(() => c.mount(), [c])
  const { enabled, rest = 0 } = options
  useEffect(() => {
    if (!enabled) c.reset()
  }, [enabled, c])
  useEffect(() => c.follow(rest), [rest, c])

  return {
    /** Arkusz właśnie wychodzi. */
    closing,
    dismiss: c.dismiss,
    sheet: useCallback((el: HTMLElement | null) => c.attach(el), [c]),
    backdrop: useCallback(
      (el: HTMLElement | null) => {
        c.els.backdrop = el
      },
      [c],
    ),
    /** Pasek przypięty do dołu ekranu (stoi w miejscu, gdy arkusz zmienia wysokość). */
    foot: useCallback(
      (el: HTMLElement | null) => {
        c.els.foot = el
      },
      [c],
    ),
    /** Uchwyt; przyciski w nim działają zwyczajnie. */
    grip: enabled ? c.grip : {},
  }
}

function controller(opts: RefObject<Options>, setClosing: (closing: boolean) => void) {
  const els: Record<'sheet' | 'backdrop' | 'foot', HTMLElement | null> = {
    sheet: null,
    backdrop: null,
    foot: null,
  }
  let entered = false
  let closing = false
  let interrupted = false
  /** Wysokość, w której arkusz stoi albo do której jedzie. */
  let goal = 0
  let height = 0
  let moving = false
  let drag: { id: number; from: number; base: number } | null = null
  const velocity = new VelocityTracker()

  const detents = () => opts.current.detents ?? SINGLE
  const offset = (i: number) => {
    const all = detents()
    const top = all[0] as number
    return ((top - (all[i] ?? top)) / top) * height
  }
  const last = () => offset(detents().length - 1)

  const motion = new SpringMotion((y) => {
    const low = last()
    const gone = height > low ? Math.min(1, Math.max(0, (y - low) / (height - low))) : 0
    const held = Math.min(Math.max(0, y), low)
    return [
      [els.sheet, { transform: y === 0 ? 'none' : `translateY(${y}px)` }],
      [els.backdrop, { opacity: String(1 - gone) }],
      [els.foot, { transform: held === 0 ? 'none' : `translateY(${-held}px)` }],
    ]
  })

  /** Arkusz gotowy do ruchu: najwyższa wysokość, przesunięcie z bieżącego miejsca. */
  const lift = () => {
    const el = els.sheet
    if (!el || moving) return
    moving = true
    const top = detents()[0] as number
    const low = detents().at(-1) as number
    if (low < top) {
      // Wysokość zmienia się tu skokowo, więc pod treścią zostaje tyle samo miejsca (najpierw ono,
      // potem wysokość): przewinięta do końca lista nie podskakuje.
      el.style.setProperty('--sheet-hidden', `${(top - low) * 100}dvh`)
      el.style.height = `${top * 100}dvh`
    }
    height = el.offsetHeight
    motion.set(offset(goal))
  }

  /** Spoczynek: bez `transform`, wysokość z klasy. */
  const settle = () => {
    moving = false
    motion.stop()
    for (const el of Object.values(els)) {
      if (!el) continue
      el.style.transform = ''
      if (el === els.backdrop) el.style.opacity = ''
    }
    if (els.sheet && detents().length > 1) {
      els.sheet.style.height = ''
      els.sheet.style.removeProperty('--sheet-hidden')
    }
  }

  const go = (i: number, v?: number) => {
    lift()
    goal = i
    motion.to(offset(i), {
      velocity: v,
      spring: v === undefined ? SMOOTH : release(v),
      onDone: settle,
    })
  }

  const enter = () => {
    entered = true
    goal = opts.current.rest ?? 0
    if (reducedMotion()) {
      crossfade(els.sheet, true)
      crossfade(els.backdrop, true)
      return
    }
    lift()
    motion.set(height)
    motion.to(offset(goal), { spring: SMOOTH, velocity: 0, onDone: settle })
  }

  const close = (v?: number) => {
    closing = true
    setClosing(true)
    if (reducedMotion()) {
      crossfade(els.backdrop, false)
      setTimeout(() => opts.current.onClose(), crossfade(els.sheet, false))
      return
    }
    lift()
    // Cel trochę za krawędzią: arkusz schodzi z ekranu z rozpędu, a nie dociąga się do niej powoli.
    motion.to(height * 1.1, {
      velocity: v === undefined ? undefined : Math.max(0, v),
      spring: EXIT,
      until: height,
      onDone: () => opts.current.onClose(),
    })
  }

  const dismiss = () => {
    if (closing) return
    if (opts.current.enabled && els.sheet) close()
    else {
      closing = true
      setClosing(true)
      setTimeout(() => opts.current.onClose(), reducedMotion() ? 0 : PANEL_OUT_MS)
    }
  }

  const grip = {
    onPointerDown: (e: PointerEvent) => {
      if (drag || e.button !== 0 || !els.sheet) return
      if ((e.target as HTMLElement).closest('button')) return
      e.currentTarget.setPointerCapture(e.pointerId)
      // Złapany w locie (także w trakcie zamykania) zostaje pod palcem.
      if (closing) {
        closing = false
        setClosing(false)
      }
      motion.stop()
      lift()
      drag = { id: e.pointerId, from: e.clientY, base: motion.value }
      velocity.reset(e.timeStamp, motion.value)
    },
    onPointerMove: (e: PointerEvent) => {
      if (drag?.id !== e.pointerId) return
      const y = drag.base + e.clientY - drag.from
      velocity.add(e.timeStamp, y)
      motion.set(y < 0 ? rubber(y, height) : y)
    },
    onPointerUp: (e: PointerEvent) => {
      if (drag?.id !== e.pointerId) return
      drag = null
      const v = velocity.at(e.timeStamp)
      const n = detents().length
      const points = [...detents().map((_, i) => offset(i)), height]
      const i = snapIndex(points, motion.value, v)
      if (i === n) close(v)
      else {
        go(i, v)
        if (i !== (opts.current.rest ?? 0)) opts.current.onRest?.(i)
      }
    },
    onPointerCancel: (e: PointerEvent) => {
      if (drag?.id !== e.pointerId) return
      drag = null
      go(goal, 0)
    },
  }

  return {
    els,
    grip,
    dismiss,
    attach: (el: HTMLElement | null) => {
      els.sheet = el
      if (el && opts.current.enabled && !entered) enter()
    },
    /** Wysokość zmieniona spoza gestu (pisanie, schowana klawiatura). */
    follow: (rest: number) => {
      if (!opts.current.enabled || !entered || closing || rest === goal || drag) return
      go(rest)
    },
    reset: () => {
      if (moving) settle()
    },
    mount: () => {
      if (interrupted) {
        interrupted = false
        opts.current.onClose()
      } else if (els.sheet && opts.current.enabled && !entered) enter()
      // Odmontowanie albo widok schowany przez router w trakcie ruchu.
      return () => {
        drag = null
        if (!moving) return
        motion.stop()
        if (closing) interrupted = true
        else settle()
      }
    },
  }
}

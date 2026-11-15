'use client'

import type { PaintMode } from '@planer/core'
import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'

// Malowanie urlopu po kalendarzu (komórki z `data-date`). Tryb (dodaj / usuń) wybiera się w pasku.
// Mysz: przeciągnięcie po dniach, zapis od razu po puszczeniu.
// Palec: kalendarz przewija się normalnie. Dotknięcie dnia = początek, dotknięcie drugiego = koniec;
// przytrzymanie dnia i przeciągnięcie maluje zakres (przy krawędzi ekranu kalendarz sam się
// przewija). Zakres z palca czeka na „zapisz” w pasku.

const HOLD_MS = 350
const MOVE_PX = 10
const EDGE_PX = 56
const SPEED_PX = 14

type Range = { from: string; to: string }
type Drag = { start: string; last: string; x: number; y: number; scroller: HTMLElement | null }

const dateOf = (el: Element | null) => el?.closest<HTMLElement>('[data-date]')?.dataset.date
const ordered = (r: Range): Range => (r.from <= r.to ? r : { from: r.to, to: r.from })

export function usePaint({
  enabled,
  mode,
  onCommit,
}: {
  enabled: boolean
  mode: PaintMode
  onCommit: (from: string, to: string, mode: PaintMode) => void
}) {
  /** zakres pod palcem / myszą w trakcie przeciągania */
  const [drag, setDrag] = useState<Range | null>(null)
  /** pierwszy dzień wybrany dotknięciem (czeka na drugi) */
  const [anchor, setAnchor] = useState<string | null>(null)
  /** zakres z palca czekający na „zapisz” */
  const [pending, setPending] = useState<Range | null>(null)
  const commit = useRef(onCommit)
  commit.current = onCommit

  const cancel = useCallback(() => {
    setAnchor(null)
    setPending(null)
  }, [])

  useEffect(() => {
    if (!enabled) {
      cancel()
      setDrag(null)
    }
  }, [enabled, cancel])

  const confirm = useCallback(() => {
    if (!pending) return
    const r = ordered(pending)
    setPending(null)
    commit.current(r.from, r.to, mode)
  }, [pending, mode])

  /** Przeciąganie od dnia `start`; `touch` = palcem (zakres czeka na „zapisz”). */
  const startDrag = useCallback(
    (start: string, x: number, y: number, cell: HTMLElement, touch: boolean) => {
      const d: Drag = {
        start,
        last: start,
        x,
        y,
        scroller: cell.closest<HTMLElement>('.overflow-x-auto'),
      }
      setAnchor(null)
      setPending(null)
      setDrag({ from: start, to: start })

      const track = () => {
        const date = dateOf(document.elementFromPoint(d.x, d.y))
        if (!date || date === d.last) return
        d.last = date
        setDrag({ from: d.start, to: date })
      }
      // Przy krawędzi ekranu (albo przewijanej w bok tabeli) kalendarz sam jedzie dalej.
      let frame = 0
      const scroll = () => {
        const dy = d.y < EDGE_PX ? -SPEED_PX : d.y > window.innerHeight - EDGE_PX * 2 ? SPEED_PX : 0
        if (dy) window.scrollBy(0, dy)
        const s = d.scroller
        if (s) {
          const r = s.getBoundingClientRect()
          const dx = d.x < r.left + EDGE_PX ? -SPEED_PX : d.x > r.right - EDGE_PX ? SPEED_PX : 0
          if (dx) s.scrollLeft += dx
        }
        track()
        frame = requestAnimationFrame(scroll)
      }
      frame = requestAnimationFrame(scroll)

      const move = (ev: PointerEvent) => {
        d.x = ev.clientX
        d.y = ev.clientY
        track()
      }
      // Palcem: bez tego przeglądarka przejęłaby ruch jako przewijanie strony.
      const block = (ev: TouchEvent) => ev.cancelable && ev.preventDefault()
      const stop = (ev: PointerEvent) => {
        cancelAnimationFrame(frame)
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', stop)
        window.removeEventListener('pointercancel', stop)
        window.removeEventListener('touchmove', block)
        setDrag(null)
        const r = ordered({ from: d.start, to: d.last })
        if (touch) setPending(r)
        else if (ev.type === 'pointerup') commit.current(r.from, r.to, mode)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', stop)
      window.addEventListener('pointercancel', stop)
      if (touch) window.addEventListener('touchmove', block, { passive: false })
    },
    [mode],
  )

  const onPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      if (!enabled || (e.pointerType === 'mouse' && e.button !== 0)) return
      const cell = (e.target as Element).closest<HTMLElement>('[data-date]')
      const date = cell?.dataset.date
      if (!cell || !date) return

      if (e.pointerType === 'mouse') {
        e.preventDefault()
        startDrag(date, e.clientX, e.clientY, cell, false)
        return
      }

      // Palec: przewijanie zostaje przeglądarce. Bez ruchu: dotknięcie albo przytrzymanie.
      const x0 = e.clientX
      const y0 = e.clientY
      let moved = false
      let held = false
      const timer = setTimeout(() => {
        if (moved) return
        held = true
        navigator.vibrate?.(10)
        startDrag(date, x0, y0, cell, true)
      }, HOLD_MS)
      const move = (ev: PointerEvent) => {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > MOVE_PX) {
          moved = true
          clearTimeout(timer)
        }
      }
      const up = (ev: PointerEvent) => {
        clearTimeout(timer)
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        window.removeEventListener('pointercancel', up)
        if (held || moved || ev.type !== 'pointerup') return
        // Dotknięcie: pierwszy dzień, potem ostatni (ponowne dotknięcie pierwszego = jeden dzień).
        if (anchor) {
          setPending(ordered({ from: anchor, to: date }))
          setAnchor(null)
        } else {
          setPending(null)
          setAnchor(date)
        }
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
      window.addEventListener('pointercancel', up)
    },
    [enabled, anchor, startDrag],
  )

  /** Czy dzień jest w zaznaczonym zakresie (przeciąganym, czekającym albo dzień startu). */
  const paintAt = useCallback(
    (date: string): PaintMode | null => {
      const r = drag ? ordered(drag) : (pending ?? (anchor ? { from: anchor, to: anchor } : null))
      if (!r) return null
      return date >= r.from && date <= r.to ? mode : null
    },
    [drag, pending, anchor, mode],
  )

  return {
    onPointerDown,
    paintAt,
    /** trwa przeciąganie */
    active: drag !== null,
    anchor,
    pending,
    confirm,
    cancel,
  }
}

'use client'

import type { PaintMode } from '@planer/core'
import { type PointerEvent as ReactPointerEvent, useCallback, useRef, useState } from 'react'

// Malowanie urlopu po kalendarzu: przeciągnięcie po dniach (komórki z `data-date`) zaznacza
// zakres od dnia startu do dnia pod palcem. Start na urlopie = gumka. Zapis po puszczeniu.

type Drag = { start: string; last: string; mode: PaintMode }
export type PaintPreview = { from: string; to: string; mode: PaintMode } | null

const dateOf = (el: Element | null) => el?.closest<HTMLElement>('[data-date]')?.dataset.date

export function usePaint({
  enabled,
  isLeave,
  onCommit,
}: {
  enabled: boolean
  isLeave: (date: string) => boolean
  onCommit: (from: string, to: string, mode: PaintMode) => void
}) {
  const [preview, setPreview] = useState<PaintPreview>(null)
  const drag = useRef<Drag | null>(null)
  const commit = useRef(onCommit)
  commit.current = onCommit

  const onPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      if (!enabled || (e.pointerType === 'mouse' && e.button !== 0)) return
      const start = dateOf(e.target as Element)
      if (!start) return
      e.preventDefault()
      const mode: PaintMode = isLeave(start) ? 'erase' : 'add'
      drag.current = { start, last: start, mode }
      setPreview({ from: start, to: start, mode })

      const move = (ev: PointerEvent) => {
        const d = drag.current
        const date = dateOf(document.elementFromPoint(ev.clientX, ev.clientY))
        if (!d || !date || date === d.last) return
        d.last = date
        setPreview({ from: d.start, to: date, mode: d.mode })
      }
      const stop = (ev: PointerEvent) => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', stop)
        window.removeEventListener('pointercancel', stop)
        const d = drag.current
        drag.current = null
        setPreview(null)
        if (d && ev.type === 'pointerup') commit.current(d.start, d.last, d.mode)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', stop)
      window.addEventListener('pointercancel', stop)
    },
    [enabled, isLeave],
  )

  /** Czy dzień jest w malowanym zakresie (i czym: dodanie albo gumka). */
  const paintAt = useCallback(
    (date: string): PaintMode | null => {
      if (!preview) return null
      const [a, b] =
        preview.from <= preview.to ? [preview.from, preview.to] : [preview.to, preview.from]
      return date >= a && date <= b ? preview.mode : null
    },
    [preview],
  )

  return { onPointerDown, paintAt, active: preview !== null }
}

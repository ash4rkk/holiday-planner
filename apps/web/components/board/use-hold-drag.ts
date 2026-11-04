'use client'

import type React from 'react'
import { useRef } from 'react'

const HOLD_MS = 350
const MOVE_PX = 8

type GestureState = {
  pointerId: number
  x: number
  y: number
  mouse: boolean
  mode: 'pending' | 'drag' | 'pan'
  lastX: number
  lastY: number
  timer?: ReturnType<typeof setTimeout>
}

type Handlers = {
  onTap: () => void
  onStart: () => void
  /** Przesunięcie od początku gestu w pikselach ekranu. */
  onMove: (dx: number, dy: number) => void
  onEnd: () => void
  /** Palec ruszył przed przytrzymaniem: przesuwa widok o tyle pikseli od ostatniego ruchu. */
  onPan?: (dx: number, dy: number) => void
}

/**
 * Gest na elemencie tablicy: tap = onTap; palec: przytrzymanie (350 ms) zaczyna przeciąganie,
 * ruch przed czasem przesuwa widok jak po tle; mysz: przeciąganie od razu po kilku pikselach.
 */
export function useHoldDrag(handlers: Handlers) {
  const h = useRef(handlers)
  h.current = handlers
  const state = useRef<GestureState | null>(null)

  const finish = () => {
    if (state.current?.timer) clearTimeout(state.current.timer)
    state.current = null
  }

  return {
    onPointerDown(e: React.PointerEvent) {
      if (e.button !== 0 || state.current) return
      if ((e.target as HTMLElement).closest('.react-flow__handle, button, a, input')) return
      const s: GestureState = {
        pointerId: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        lastX: e.clientX,
        lastY: e.clientY,
        mouse: e.pointerType === 'mouse',
        mode: 'pending',
      }
      state.current = s
      e.currentTarget.setPointerCapture(e.pointerId)
      if (!s.mouse) {
        s.timer = setTimeout(() => {
          if (state.current !== s || s.mode !== 'pending') return
          s.mode = 'drag'
          navigator.vibrate?.(10)
          h.current.onStart()
        }, HOLD_MS)
      }
    },
    onPointerMove(e: React.PointerEvent) {
      const s = state.current
      if (!s || s.pointerId !== e.pointerId) return
      const dx = e.clientX - s.x
      const dy = e.clientY - s.y
      if (s.mode === 'pending' && Math.hypot(dx, dy) > (s.mouse ? 3 : MOVE_PX)) {
        if (s.timer) clearTimeout(s.timer)
        s.mode = s.mouse ? 'drag' : 'pan'
        if (s.mouse) h.current.onStart()
      }
      if (s.mode === 'drag') h.current.onMove(dx, dy)
      if (s.mode === 'pan') h.current.onPan?.(e.clientX - s.lastX, e.clientY - s.lastY)
      s.lastX = e.clientX
      s.lastY = e.clientY
    },
    onPointerUp(e: React.PointerEvent) {
      const s = state.current
      if (!s || s.pointerId !== e.pointerId) return
      if (s.mode === 'drag') h.current.onEnd()
      else if (s.mode === 'pending') h.current.onTap()
      finish()
    },
    onPointerCancel(e: React.PointerEvent) {
      const s = state.current
      if (!s || s.pointerId !== e.pointerId) return
      if (s.mode === 'drag') h.current.onEnd()
      finish()
    },
    // Przytrzymanie palcem nie otwiera menu przeglądarki.
    onContextMenu(e: React.MouseEvent) {
      e.preventDefault()
    },
  }
}

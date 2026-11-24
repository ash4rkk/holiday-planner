'use client'

import { showPackingBar, todayLocal } from '@planer/core'
import { Check, Luggage } from 'lucide-react'
import { type PointerEvent, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cx } from '@/components/ui'
import { springFrom } from '@/lib/motion'
import { project, release, VelocityTracker } from '@/lib/spring'
import { useHideWhenInactive } from '@/lib/use-hide-when-inactive'
import { openPacking, usePackingOpen } from '@/lib/use-packing-drawer'
import { usePacking, useTrip } from '@/lib/yjs/trip-doc'
import { Ring } from './packing-ui'

type Spot = { side: 'left' | 'right'; top: number }
const KEY = 'planer:packing-tab'
const DEFAULT: Spot = { side: 'right', top: 0.38 }
/** Ruch palca, od którego dotknięcie staje się przeciąganiem. */
const DRAG_PX = 6
/** Zakładka nie wchodzi pod górny pasek ani pod menu dolne. */
const MIN_TOP = 72
const MIN_BOTTOM = 160

function readSpot(): Spot {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Spot | null
    if (v && (v.side === 'left' || v.side === 'right') && typeof v.top === 'number') return v
  } catch {}
  return DEFAULT
}

function saveSpot(spot: Spot) {
  try {
    localStorage.setItem(KEY, JSON.stringify(spot))
  } catch {}
}

/**
 * Przed wyjazdem (w oknie dni z ustawień): zakładka przy krawędzi ekranu nad każdym widokiem —
 * pierścień postępu, ile zostało, za ile dni. Dotknięcie otwiera listę; przeciągnięcie przesuwa
 * ją w pionie i przykleja do bliższego boku (miejsce zapamiętane na tym urządzeniu).
 */
export function PackingTab() {
  const { trip } = useTrip()
  const items = usePacking()
  const drawerOpen = usePackingOpen()
  const ref = useRef<HTMLDivElement>(null)
  useHideWhenInactive(ref)
  const [mounted, setMounted] = useState(false)
  const [spot, setSpot] = useState<Spot>(DEFAULT)
  /** Lewy górny róg zakładki pod palcem. */
  const [drag, setDrag] = useState<{ left: number; top: number } | null>(null)
  const from = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(
    null,
  )
  const speedX = useRef(new VelocityTracker())
  const speedY = useRef(new VelocityTracker())
  /** Skąd i z jaką prędkością zakładka dojeżdża do krawędzi po puszczeniu. */
  const thrown = useRef<{ left: number; top: number; vx: number; vy: number } | null>(null)
  const anim = useRef<Animation | undefined>(undefined)
  useLayoutEffect(() => {
    const t = thrown.current
    const el = ref.current
    if (!t || !el || drag) return
    thrown.current = null
    const r = el.getBoundingClientRect()
    anim.current = springFrom(
      el,
      { dx: t.left - r.left, dy: t.top - r.top, vx: t.vx, vy: t.vy },
      release(Math.hypot(t.vx, t.vy)),
    )
  }, [drag])

  useEffect(() => {
    setMounted(true)
    setSpot(readSpot())
  }, [])

  const today = todayLocal()
  if (!mounted || drawerOpen || !showPackingBar(today, trip.startDate, trip.packingDays))
    return null

  const packed = items.filter((i) => i.packed).length
  const left = items.length - packed
  const done = items.length > 0 && left === 0
  const days = trip.startDate
    ? Math.round((Date.parse(trip.startDate) - Date.parse(today)) / 86_400_000)
    : 0

  const clampTop = (y: number) =>
    Math.min(Math.max(y, MIN_TOP), window.innerHeight - MIN_BOTTOM) / window.innerHeight

  const handlers = {
    onPointerDown: (e: PointerEvent) => {
      // W locie zostaje tam, gdzie ją złapano.
      const r = e.currentTarget.getBoundingClientRect()
      const flying = anim.current?.playState === 'running'
      anim.current?.cancel()
      from.current = { x: e.clientX, y: e.clientY, left: r.left, top: r.top, moved: flying }
      if (flying) setDrag({ left: r.left, top: r.top })
      speedX.current.reset(e.timeStamp, e.clientX)
      speedY.current.reset(e.timeStamp, e.clientY)
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    onPointerMove: (e: PointerEvent) => {
      const f = from.current
      if (!f) return
      speedX.current.add(e.timeStamp, e.clientX)
      speedY.current.add(e.timeStamp, e.clientY)
      if (!f.moved && Math.hypot(e.clientX - f.x, e.clientY - f.y) < DRAG_PX) return
      f.moved = true
      setDrag({ left: f.left + e.clientX - f.x, top: f.top + e.clientY - f.y })
    },
    onPointerUp: (e: PointerEvent) => {
      const f = from.current
      from.current = null
      setDrag(null)
      if (!f) return
      if (!f.moved) {
        openPacking()
        return
      }
      const vx = speedX.current.at(e.timeStamp)
      const vy = speedY.current.at(e.timeStamp)
      const left = f.left + e.clientX - f.x
      const top = f.top + e.clientY - f.y
      thrown.current = { left, top, vx, vy }
      // Bok i wysokość z miejsca, do którego zakładka doleciałaby rzucona.
      const next: Spot = {
        side: e.clientX + project(vx) < window.innerWidth / 2 ? 'left' : 'right',
        top: clampTop(top + project(vy, 0.99)),
      }
      setSpot(next)
      saveSpot(next)
    },
    onPointerCancel: () => {
      const f = from.current
      from.current = null
      if (f && drag) thrown.current = { ...drag, vx: 0, vy: 0 }
      setDrag(null)
    },
  }

  return createPortal(
    <div
      ref={ref}
      {...handlers}
      role="button"
      tabIndex={0}
      aria-label={`lista pakowania: ${done ? 'wszystko spakowane' : `zostało ${left}`}, otwórz`}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && openPacking()}
      className={cx(
        'fixed z-(--z-overlay) flex touch-none flex-col items-center gap-1 border border-line bg-panel py-3 shadow-float select-none',
        drag
          ? 'rounded-island px-2'
          : spot.side === 'right'
            ? 'right-0 rounded-l-island border-r-0 pr-2 pl-3'
            : 'left-0 rounded-r-island border-l-0 pr-3 pl-2',
      )}
      style={drag ?? { top: `${spot.top * 100}%` }}
    >
      <div className="relative">
        <Ring value={packed} total={items.length} size={40} stroke={4} />
        {done ? (
          <Check className="absolute inset-0 m-auto size-4 text-green" aria-hidden="true" />
        ) : (
          <Luggage className="absolute inset-0 m-auto size-4 text-accent" aria-hidden="true" />
        )}
      </div>
      {items.length === 0 ? (
        <span className="text-2xs text-muted">pusta</span>
      ) : (
        <b className={cx('text-xs tabular-nums', done && 'text-green')}>{done ? '•' : left}</b>
      )}
      <span className="text-2xs text-subtle">{days === 1 ? 'jutro' : `za ${days} dni`}</span>
    </div>,
    document.body,
  )
}

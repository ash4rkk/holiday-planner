'use client'

import {
  formatDateSpan,
  formatDayHeader,
  holidayOn,
  isWeekend,
  type LeaveRegions,
  regionOf,
} from '@planer/core'
import {
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { cx } from '@/components/ui'
import { Mark } from './day-cell'
import {
  type DayIndex,
  eventColor,
  leaveCellClass,
  type PlannerCalendar,
  periodDaysText,
} from './model'

// Dymek dnia w planerze urlopów: co i kiedy się dzieje. Myszą po najechaniu, na telefonie po
// przytrzymaniu dnia (zwykłe dotknięcie dalej zaznacza urlop). Komórki rozpoznaje po `data-date`.

const HOVER_MS = 250
const HOLD_MS = 450
const MOVE_PX = 10
const WIDTH = 288

type Tip = { date: string; rect: DOMRect; pinned: boolean }

const cellOf = (el: EventTarget | null) =>
  el instanceof Element ? el.closest<HTMLElement>('[data-date]') : null

export function useDayTooltip(enabled: boolean) {
  const [tip, setTip] = useState<Tip | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const hold = useRef<{ x: number; y: number } | null>(null)
  const suppressClick = useRef(false)

  const close = useCallback(() => {
    clearTimeout(timer.current)
    hold.current = null
    setTip(null)
  }, [])

  useEffect(() => {
    if (!enabled) close()
  }, [enabled, close])

  // Przypięty dymek (po przytrzymaniu) zamyka dotknięcie gdziekolwiek, przewinięcie albo Esc.
  useEffect(() => {
    if (!tip?.pinned) return
    const off = () => setTip(null)
    const key = (e: KeyboardEvent) => e.key === 'Escape' && off()
    // Opóźnione, żeby puszczenie palca po przytrzymaniu nie zamknęło dymka od razu.
    const t = setTimeout(() => document.addEventListener('pointerdown', off, true), 0)
    window.addEventListener('scroll', off, true)
    document.addEventListener('keydown', key)
    return () => {
      clearTimeout(t)
      document.removeEventListener('pointerdown', off, true)
      window.removeEventListener('scroll', off, true)
      document.removeEventListener('keydown', key)
    }
  }, [tip?.pinned])

  const onPointerOver = (e: ReactPointerEvent) => {
    if (!enabled || e.pointerType !== 'mouse') return
    const cell = cellOf(e.target)
    clearTimeout(timer.current)
    if (!cell?.dataset.date) {
      setTip((t) => (t?.pinned ? t : null))
      return
    }
    const date = cell.dataset.date
    timer.current = setTimeout(
      () => setTip({ date, rect: cell.getBoundingClientRect(), pinned: false }),
      HOVER_MS,
    )
  }

  const onPointerLeave = () => {
    clearTimeout(timer.current)
    setTip((t) => (t?.pinned ? t : null))
  }

  const onPointerDown = (e: ReactPointerEvent) => {
    if (!enabled || e.pointerType === 'mouse') return
    const cell = cellOf(e.target)
    if (!cell?.dataset.date) return
    const date = cell.dataset.date
    hold.current = { x: e.clientX, y: e.clientY }
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      hold.current = null
      suppressClick.current = true
      navigator.vibrate?.(10)
      setTip({ date, rect: cell.getBoundingClientRect(), pinned: true })
    }, HOLD_MS)
  }

  const onPointerMove = (e: ReactPointerEvent) => {
    const h = hold.current
    if (h && Math.hypot(e.clientX - h.x, e.clientY - h.y) > MOVE_PX) {
      clearTimeout(timer.current)
      hold.current = null
    }
  }

  const onPointerUp = () => {
    if (hold.current) clearTimeout(timer.current)
    hold.current = null
  }

  /** Puszczenie palca po przytrzymaniu nie zaznacza dnia. */
  const onClickCapture = (e: ReactMouseEvent) => {
    if (!suppressClick.current) return
    suppressClick.current = false
    e.stopPropagation()
    e.preventDefault()
  }

  /** Bez menu systemowego przy przytrzymaniu dnia. */
  const onContextMenu = (e: ReactMouseEvent) => {
    if (enabled && cellOf(e.target)) e.preventDefault()
  }

  return {
    tip,
    close,
    bind: {
      onPointerOver,
      onPointerLeave,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      onClickCapture,
      onContextMenu,
    },
  }
}

export function DayTooltip({
  tip,
  index,
  regions,
  calendars,
  persons,
}: {
  tip: Tip
  index: DayIndex
  regions: LeaveRegions
  calendars: PlannerCalendar[]
  persons: string[]
}) {
  const { date, rect } = tip
  const periods = index.periods(date)
  const holidays = index.holidays(date)
  const trips = index.trips(date)
  const events = index.events(date)
  const calName = new Map(calendars.map((c) => [c.id, c.name]))
  // Kto ma tego dnia wolne z powodu święta (każdy wg swojego regionu).
  const offFor = (persons.length ? persons : [null]).flatMap((p) => {
    const h = holidayOn(date, p ? regionOf(regions, p) : regions.fallback)
    return h ? [{ p, h }] : []
  })

  const vw = window.innerWidth
  const vh = window.innerHeight
  const width = Math.min(WIDTH, vw - 16)
  const left = Math.min(Math.max(8, rect.left + rect.width / 2 - width / 2), vw - width - 8)
  // Nad dniem, gdy jest miejsce; inaczej pod.
  const above = rect.top > vh * 0.45
  const style = above
    ? { left, width, bottom: vh - rect.top + 6 }
    : { left, width, top: rect.bottom + 6 }

  const kind = periods.length
    ? null
    : isWeekend(date)
      ? 'weekend'
      : offFor.length && offFor.length === Math.max(1, persons.length)
        ? `wolne · ${offFor[0]?.h.name}`
        : offFor.length
          ? `dzień roboczy · wolne ma ${offFor.map((x) => x.p).join(', ')}`
          : 'dzień roboczy'

  return createPortal(
    <div
      role="tooltip"
      style={style}
      className="island shadow-float fade-in pointer-events-none fixed z-(--z-popover) flex flex-col gap-2 p-3 text-sm"
    >
      <p className="font-bold">
        {formatDayHeader(date)} {date.slice(0, 4)}
      </p>

      {periods.map((period) => (
        <div
          key={period.id}
          className={cx(
            'flex flex-col gap-0.5 rounded-small px-2 py-1.5',
            leaveCellClass(period.person, persons, period.approved),
          )}
        >
          <span className="font-bold">
            {period.person
              ? `urlop · ${period.person}`
              : persons.length
                ? 'urlop wspólny'
                : 'urlop'}
            <span className="font-normal">
              {' '}
              · {period.approved ? '✓ zatwierdzony' : 'do zatwierdzenia'}
            </span>
          </span>
          <span className="text-xs">{formatDateSpan(period.startDate, period.endDate)}</span>
          <span className="text-xs tabular-nums">
            {periodDaysText(period, persons, regions)}
            {period.note ? ` · ${period.note}` : ''}
          </span>
        </div>
      ))}
      {kind && <p className="text-xs text-subtle">{kind}</p>}

      {holidays.length > 0 && (
        <ul className="flex flex-col gap-1">
          {holidays.map((h) => (
            <li key={h.region} className="flex items-center gap-2">
              <span className="flex size-3 items-center justify-center">
                <Mark kind={h.region === 'PL' ? 'pl' : 'bb'} />
              </span>
              <span className="min-w-0 flex-1">
                {h.name}
                {h.region !== 'PL' && (
                  <span className="text-xs text-subtle"> · {h.localName}, Brandenburgia</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {trips.length > 0 && (
        <ul className="flex flex-col gap-1">
          {trips.map((t) => (
            <li key={t.id} className="flex items-center gap-2">
              <span className="flex h-[11px] w-4 shrink-0 items-center">
                {t.flag ?? <span className="h-0.5 w-3 rounded-full bg-trip" />}
              </span>
              <span className="min-w-0 flex-1 truncate">{t.title}</span>
              <span className="shrink-0 text-xs text-subtle">
                {formatDateSpan(t.startDate, t.endDate).replace(/ \d{4}$/, '')}
              </span>
            </li>
          ))}
        </ul>
      )}

      {events.length > 0 && (
        <ul className="flex flex-col gap-1">
          {events.slice(0, 6).map((e) => (
            <li key={`${e.calendarId}${e.uid}`} className="flex items-center gap-2">
              <span className="flex size-3 items-center justify-center">
                <Mark kind="event" color={eventColor(e)} />
              </span>
              <span className="w-11 shrink-0 text-xs text-muted tabular-nums">
                {e.allDay ? 'cały' : e.startTime}
              </span>
              <span className="min-w-0 flex-1 truncate">{e.title}</span>
              <span className="max-w-20 shrink-0 truncate text-xs text-subtle">
                {calName.get(e.calendarId)}
              </span>
            </li>
          ))}
          {events.length > 6 && (
            <li className="pl-5 text-xs text-subtle">i jeszcze {events.length - 6}</li>
          )}
        </ul>
      )}
    </div>,
    document.body,
  )
}

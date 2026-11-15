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
  type RefObject,
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
  type PlannerPeriod,
  periodDaysText,
} from './model'

// Dymek dnia w planerze urlopów: co i kiedy się dzieje. Dotknięcie albo kliknięcie dnia przypina
// dymek (z „edytuj” przy urlopie), mysz pokazuje go też po najechaniu. Urlop dodaje tylko pędzel.
// Komórki rozpoznaje po `data-date`.

const HOVER_MS = 250
const WIDTH = 288

type Tip = { date: string; rect: DOMRect; pinned: boolean }

const cellOf = (el: EventTarget | null) =>
  el instanceof Element ? el.closest<HTMLElement>('[data-date]') : null

export function useDayTooltip(enabled: boolean) {
  const [tip, setTip] = useState<Tip | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const ref = useRef<HTMLDivElement>(null)

  const close = useCallback(() => {
    clearTimeout(timer.current)
    setTip(null)
  }, [])

  useEffect(() => {
    if (!enabled) close()
  }, [enabled, close])

  // Przypięty dymek zamyka dotknięcie obok (nie w dymku i nie w tym samym dniu — ten przełącza),
  // przewinięcie albo Esc.
  useEffect(() => {
    if (!tip?.pinned) return
    const date = tip.date
    const down = (e: PointerEvent) => {
      if (ref.current?.contains(e.target as Node)) return
      if (cellOf(e.target)?.dataset.date === date) return
      setTip(null)
    }
    const off = () => setTip(null)
    const key = (e: KeyboardEvent) => e.key === 'Escape' && off()
    document.addEventListener('pointerdown', down, true)
    window.addEventListener('scroll', off, true)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('pointerdown', down, true)
      window.removeEventListener('scroll', off, true)
      document.removeEventListener('keydown', key)
    }
  }, [tip?.pinned, tip?.date])

  /** Dotknięcie dnia: przypina dymek, drugie dotknięcie tego samego dnia go zamyka. */
  const toggle = useCallback(
    (date: string) => {
      if (!enabled) return
      clearTimeout(timer.current)
      const cell = document.querySelector<HTMLElement>(`[data-date="${date}"]`)
      if (!cell) return
      setTip((t) =>
        t?.pinned && t.date === date
          ? null
          : { date, rect: cell.getBoundingClientRect(), pinned: true },
      )
    },
    [enabled],
  )

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
      () =>
        setTip((t) =>
          t?.pinned ? t : { date, rect: cell.getBoundingClientRect(), pinned: false },
        ),
      HOVER_MS,
    )
  }

  const onPointerLeave = () => {
    clearTimeout(timer.current)
    setTip((t) => (t?.pinned ? t : null))
  }

  return { tip, close, toggle, ref, bind: { onPointerOver, onPointerLeave } }
}

export function DayTooltip({
  tip,
  index,
  regions,
  calendars,
  persons,
  tipRef,
  onEdit,
}: {
  tip: Tip
  index: DayIndex
  regions: LeaveRegions
  calendars: PlannerCalendar[]
  persons: string[]
  tipRef: RefObject<HTMLDivElement | null>
  onEdit: (period: PlannerPeriod) => void
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
      ref={tipRef}
      role={tip.pinned ? 'dialog' : 'tooltip'}
      aria-label={tip.pinned ? formatDayHeader(date) : undefined}
      style={style}
      className={cx(
        'island shadow-float fade-in fixed z-(--z-popover) flex flex-col gap-2 p-3 text-sm',
        !tip.pinned && 'pointer-events-none',
      )}
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
          {tip.pinned && (
            <button
              type="button"
              onClick={() => onEdit(period)}
              className="hit -mb-0.5 self-start text-xs font-bold underline-offset-2 hover:underline"
            >
              edytuj ›
            </button>
          )}
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

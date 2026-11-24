'use client'

import { useRef } from 'react'
import { cx } from '@/components/ui'
import { HolidayMarks, Mark, PendingMark } from './day-cell'
import {
  type DayIndex,
  ERASE_CELL,
  eventColor,
  type LeaveAt,
  MONTH_NAMES,
  monthWeeks,
  type PaintAt,
  WEEKDAYS,
} from './model'

const SWIPE_PX = 50

/** Jeden duży miesiąc: nazwy świąt i przydymione wydarzenia w komórkach, przesuwany w bok. */
export function MonthView({
  year,
  month,
  index,
  today,
  picking,
  onPick,
  onMonth,
  paintAt,
  leaveAt,
}: {
  year: number
  month: number
  index: DayIndex
  today: string
  picking: string | null
  onPick: (date: string) => void
  onMonth: (month: number) => void
  paintAt?: PaintAt
  leaveAt: LeaveAt
}) {
  const start = useRef<{ x: number; y: number } | null>(null)
  const swiped = useRef(false)

  return (
    <section
      className="island flex touch-pan-y flex-col gap-1 p-1.5"
      aria-label={MONTH_NAMES[month]}
      onPointerDown={(e) => {
        if (paintAt) return
        start.current = { x: e.clientX, y: e.clientY }
        swiped.current = false
      }}
      onPointerUp={(e) => {
        const s = start.current
        start.current = null
        if (!s) return
        const dx = e.clientX - s.x
        if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(e.clientY - s.y)) return
        swiped.current = true
        const next = month + (dx < 0 ? 1 : -1)
        if (next >= 0 && next <= 11) onMonth(next)
      }}
      onClickCapture={(e) => {
        // Puszczenie palca po przesunięciu nie wybiera dnia.
        if (swiped.current) {
          e.stopPropagation()
          swiped.current = false
        }
      }}
    >
      <div className="flex items-center justify-between">
        <button
          type="button"
          aria-label="poprzedni miesiąc"
          disabled={month === 0}
          onClick={() => onMonth(month - 1)}
          className="press flex size-11 items-center justify-center text-lg text-muted hover:text-accent disabled:opacity-30"
        >
          ‹
        </button>
        <h2 className="font-bold">
          {MONTH_NAMES[month]} {year}
        </h2>
        <button
          type="button"
          aria-label="następny miesiąc"
          disabled={month === 11}
          onClick={() => onMonth(month + 1)}
          className="press flex size-11 items-center justify-center text-lg text-muted hover:text-accent disabled:opacity-30"
        >
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 text-center text-2xs text-subtle">
        {WEEKDAYS.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px">
        {monthWeeks(year, month)
          .flat()
          .map((date, i) => {
            if (!date) {
              return <span key={`e${i}`} />
            }
            const paint = paintAt?.(date) ?? null
            const leave = leaveAt(date)
            const period = Boolean(leave)
            const holidays = index.holidays(date)
            const events = index.events(date)
            const trips = index.trips(date)
            return (
              <button
                key={date}
                type="button"
                data-date={date}
                onClick={() => onPick(date)}
                className={cx(
                  'flex min-h-20 min-w-0 flex-col items-stretch gap-0.5 overflow-hidden rounded-small border border-line p-1 text-left',
                  // na urlopie cały tekst w kolorze urlopu (nazwy świąt i wydarzeń też czytelne)
                  leave &&
                    cx(
                      leave.cls,
                      'border-transparent',
                      leave.approved && '[&_span]:text-on-accent',
                    ),
                  paint === 'erase' && ERASE_CELL,
                  picking === date && 'border-accent',
                  date === today && 'border-sel',
                  'hover:border-accent',
                )}
              >
                <span
                  className={cx(
                    'flex w-full items-center gap-1 text-xs tabular-nums',
                    period ? '' : index.off(date) ? 'text-subtle' : 'text-text',
                  )}
                >
                  {Number(date.slice(8))}
                  <HolidayMarks marks={holidays} onLeave={!!period} />
                  {leave && !leave.approved && (
                    <span className="ml-auto flex">
                      <PendingMark />
                    </span>
                  )}
                </span>
                {holidays.map((h) => (
                  <span
                    key={h.region}
                    className={cx(
                      'truncate text-2xs',
                      h.region === 'PL' ? 'text-hol-pl' : 'text-hol-bb',
                    )}
                  >
                    {h.region === 'PL' ? h.name : h.localName}
                  </span>
                ))}
                {trips.map((t) => (
                  <span key={t.id} className="truncate border-t-2 border-trip text-2xs text-muted">
                    {t.title}
                  </span>
                ))}
                {events.slice(0, 3).map((e) => (
                  <span
                    key={`${e.calendarId}${e.uid}`}
                    className="flex min-w-0 items-center gap-1 text-2xs text-muted opacity-75"
                  >
                    <Mark kind="event" color={eventColor(e)} />
                    <span className="truncate">
                      {e.startTime ? `${e.startTime} ` : ''}
                      {e.title}
                    </span>
                  </span>
                ))}
                {events.length > 3 && (
                  <span className="text-2xs text-subtle opacity-60">+{events.length - 3}</span>
                )}
              </button>
            )
          })}
      </div>
    </section>
  )
}

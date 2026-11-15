'use client'

import { daysBetween, holidaysBetween } from '@planer/core'
import { useEffect, useRef } from 'react'
import { cx } from '@/components/ui'
import {
  type DayIndex,
  type Layers,
  MONTH_NAMES,
  type PlannerCalendar,
  type PlannerPeriod,
} from './model'

/** Szerokość dnia na osi (px). */
const DAY = 6
const LANE = 'relative h-8'

type Bar = { key: string; start: string; end: string; label: string; onClick?: () => void }

/** Poziomy rok: tory urlopu, wyjazdów i każdego widocznego kalendarza; święta jako pionowe kreski. */
export function GanttView({
  year,
  periods,
  index,
  layers,
  calendars,
  today,
  onEdit,
}: {
  year: number
  periods: PlannerPeriod[]
  index: DayIndex
  layers: Layers
  calendars: PlannerCalendar[]
  today: string
  onEdit: (p: PlannerPeriod) => void
}) {
  const from = `${year}-01-01`
  const to = `${year}-12-31`
  const total = daysBetween(from, to) + 1
  const scroller = useRef<HTMLDivElement>(null)
  const x = (date: string) => Math.max(0, daysBetween(from, date < from ? from : date)) * DAY
  const w = (start: string, end: string) =>
    (daysBetween(start < from ? from : start, end > to ? to : end) + 1) * DAY

  useEffect(() => {
    const el = scroller.current
    if (el && today >= from && today <= to) el.scrollLeft = x(today) - el.clientWidth / 3
  }, [year])

  const lanes: { key: string; label: string; dim?: boolean; bars: Bar[]; leave?: boolean }[] = [
    {
      key: 'leave',
      label: 'urlop',
      leave: true,
      bars: periods.map((p) => ({
        key: p.id,
        start: p.startDate,
        end: p.endDate,
        label: p.note ?? '',
        onClick: () => onEdit(p),
      })),
    },
  ]
  if (layers.trips) {
    lanes.push({
      key: 'trips',
      label: 'wyjazdy',
      bars: index.visibleTrips.map((t) => ({
        key: t.id,
        start: t.startDate,
        end: t.endDate,
        label: t.title,
      })),
    })
  }
  for (const cal of calendars) {
    if (layers.hiddenCalendars.includes(cal.id)) continue
    lanes.push({
      key: cal.id,
      label: cal.name,
      dim: true,
      bars: index.visibleEvents
        .filter((e) => e.calendarId === cal.id)
        .map((e) => ({ key: e.uid, start: e.startDate, end: e.endDate, label: e.title })),
    })
  }
  const holidays = [
    ...(layers.pl ? holidaysBetween('PL', from, to) : []),
    ...(layers.bb ? holidaysBetween('DE-BB', from, to) : []),
  ]

  return (
    <div className="island overflow-hidden">
      <div ref={scroller} className="overflow-x-auto overscroll-x-contain">
        <div className="relative" style={{ width: total * DAY }}>
          {/* miesiące */}
          <div className="flex h-7 border-b border-line">
            {MONTH_NAMES.map((name, m) => {
              const days = new Date(Date.UTC(year, m + 1, 0)).getUTCDate()
              return (
                <span
                  key={name}
                  className="shrink-0 truncate border-l border-line px-1 pt-1 text-2xs text-subtle first:border-l-0"
                  style={{ width: days * DAY }}
                >
                  {name}
                </span>
              )
            })}
          </div>
          {/* święta i dziś przez wszystkie tory */}
          {holidays.map((h) => (
            <span
              key={`${h.region}${h.date}`}
              title={h.region === 'PL' ? h.name : `${h.localName} (BB)`}
              className={cx(
                'pointer-events-none absolute top-7 bottom-0 border-l border-lavender',
                h.region !== 'PL' && 'border-dashed',
              )}
              style={{ left: x(h.date) + DAY / 2 }}
            />
          ))}
          {today >= from && today <= to && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute top-0 bottom-0 border-l border-accent"
              style={{ left: x(today) + DAY / 2 }}
            />
          )}
          {lanes.map((lane) => (
            <div key={lane.key} className="border-b border-line last:border-b-0">
              <span className="sticky left-0 block w-fit truncate px-2 pt-1 text-2xs text-subtle">
                {lane.label}
              </span>
              <div className={cx(LANE, lane.dim && 'opacity-50')}>
                {lane.bars.map((b) => {
                  const cls = cx(
                    'absolute top-1 bottom-1 truncate rounded-small border px-1 text-left text-2xs leading-6',
                    lane.leave
                      ? 'border-accent bg-active font-bold text-text'
                      : 'border-line bg-raised text-muted',
                  )
                  const style = { left: x(b.start), width: Math.max(DAY, w(b.start, b.end)) }
                  const title = `${b.label || 'urlop'} · ${b.start === b.end ? b.start : `${b.start} – ${b.end}`}`
                  return b.onClick ? (
                    <button
                      key={b.key}
                      type="button"
                      title={title}
                      onClick={b.onClick}
                      className={cx(cls, 'hover:border-sel')}
                      style={style}
                    >
                      {b.label}
                    </button>
                  ) : (
                    <span key={b.key} title={title} className={cls} style={style}>
                      {b.label}
                    </span>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      <p className="border-t border-line px-3 py-2 text-2xs text-subtle">
        kreski: święta w Polsce (ciągłe) i w Brandenburgii (przerywane)
      </p>
    </div>
  )
}

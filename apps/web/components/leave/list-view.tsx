'use client'

import {
  formatDateSpan,
  formatShortDate,
  freeSpan,
  type HolidayRegion,
  holidaysBetween,
  leaveDays,
} from '@planer/core'
import { buttonClass } from '@/components/ui'
import type { DayIndex, Layers, PlannerPeriod } from './model'

const daysWord = (n: number) => (n === 1 ? 'dzień' : 'dni')

/** Lista okresów urlopu w roku z liczbą dni i tym, co dzieje się w tym czasie. */
export function ListView({
  year,
  region,
  periods,
  index,
  layers,
  onEdit,
  onAdd,
}: {
  year: number
  region: HolidayRegion
  periods: PlannerPeriod[]
  index: DayIndex
  layers: Layers
  onEdit: (p: PlannerPeriod) => void
  onAdd: () => void
}) {
  const from = `${year}-01-01`
  const to = `${year}-12-31`
  const list = periods.filter((p) => p.endDate >= from && p.startDate <= to)
  if (!list.length) {
    return (
      <div className="island flex flex-col gap-3 p-4">
        <p className="text-sm text-muted">● w {year} nie ma jeszcze urlopu</p>
        <button type="button" onClick={onAdd} className={buttonClass('primary')}>
          dodaj urlop
        </button>
      </div>
    )
  }
  return (
    <ul className="flex flex-col gap-1">
      {list.map((p) => {
        const days = leaveDays(p.startDate, p.endDate, region)
        const free = freeSpan(p.startDate, p.endDate, region)
        const trips = index.visibleTrips.filter(
          (t) => t.startDate <= p.endDate && t.endDate >= p.startDate,
        )
        const events = index.visibleEvents.filter(
          (e) => e.startDate <= p.endDate && e.endDate >= p.startDate,
        )
        const holidays = [
          ...(layers.pl ? holidaysBetween('PL', p.startDate, p.endDate) : []),
          ...(layers.bb ? holidaysBetween('DE-BB', p.startDate, p.endDate) : []),
        ].sort((a, b) => a.date.localeCompare(b.date))
        const more = trips.length + events.length + holidays.length
        return (
          <li key={p.id} className="island flex flex-col">
            <button
              type="button"
              onClick={() => onEdit(p)}
              className="flex min-h-12 flex-col items-start gap-0.5 px-4 py-2 text-left hover:text-accent"
            >
              <span className="font-bold">{formatDateSpan(p.startDate, p.endDate)}</span>
              <span className="text-sm text-muted tabular-nums">
                {days} {daysWord(days)} urlopu · {free} {daysWord(free)} wolnego
                {p.note ? ` · ${p.note}` : ''}
              </span>
            </button>
            {more > 0 && (
              <details className="group border-t border-line">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-4 text-xs text-subtle hover:text-accent [&::-webkit-details-marker]:hidden">
                  <span>w tym czasie · {more}</span>
                  <span aria-hidden="true" className="transition-transform group-open:rotate-90">
                    ›
                  </span>
                </summary>
                <ul className="flex flex-col gap-1 px-4 pb-3 text-sm">
                  {trips.map((t) => (
                    <li key={t.id} className="text-muted">
                      wyjazd · {t.title}
                    </li>
                  ))}
                  {holidays.map((h) => (
                    <li key={`${h.region}${h.date}`} className="text-muted">
                      {formatShortDate(h.date)} ·{' '}
                      {h.region === 'PL' ? h.name : `${h.localName} (BB)`}
                    </li>
                  ))}
                  {events.map((e) => (
                    <li key={`${e.calendarId}${e.uid}`} className="text-muted opacity-60">
                      {formatShortDate(e.startDate)}
                      {e.startTime ? ` ${e.startTime}` : ''} · {e.title}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </li>
        )
      })}
    </ul>
  )
}

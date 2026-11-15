'use client'

import { formatDateSpan, formatShortDate, holidaysBetween, type LeaveRegions } from '@planer/core'
import { buttonClass, cx } from '@/components/ui'
import {
  type DayIndex,
  type Layers,
  leaveBg,
  leaveCellClass,
  type PlannerPeriod,
  periodDaysText,
} from './model'

/** Lista okresów urlopu w roku z liczbą dni i tym, co dzieje się w tym czasie. */
export function ListView({
  year,
  regions,
  periods,
  index,
  layers,
  persons,
  onEdit,
  onAdd,
  onToggleApproved,
}: {
  year: number
  regions: LeaveRegions
  periods: PlannerPeriod[]
  index: DayIndex
  layers: Layers
  persons: string[]
  onEdit: (p: PlannerPeriod) => void
  onAdd: () => void
  onToggleApproved: (p: PlannerPeriod) => void
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
            <div className="flex items-start">
              <button
                type="button"
                onClick={() => onEdit(p)}
                className="flex min-h-12 min-w-0 flex-1 flex-col items-start gap-0.5 py-2 pl-4 text-left hover:text-accent"
              >
                <span className="flex items-center gap-2 font-bold">
                  {/* Kto ma urlop: pierwsze, w kolorze urlopu (jasne, gdy do zatwierdzenia). */}
                  {persons.length > 0 ? (
                    <span
                      className={cx(
                        'shrink-0 rounded-[6px] px-2 py-0.5 text-xs',
                        p.approved
                          ? cx(leaveBg(p.person, persons), 'text-on-accent')
                          : leaveCellClass(p.person, persons, false),
                      )}
                    >
                      {p.person ?? 'oboje'}
                    </span>
                  ) : (
                    <span
                      aria-hidden="true"
                      className={cx(
                        'size-3 shrink-0 rounded-[3px]',
                        p.approved
                          ? leaveBg(p.person, persons)
                          : leaveCellClass(p.person, persons, false),
                      )}
                    />
                  )}
                  {formatDateSpan(p.startDate, p.endDate)}
                </span>
                <span className="text-sm text-muted tabular-nums">
                  {periodDaysText(p, persons, regions)}
                  {p.note ? ` · ${p.note}` : ''}
                </span>
              </button>
              {/* Status jednym dotknięciem (zatwierdzenie w pracy przychodzi zwykle później). */}
              <button
                type="button"
                aria-pressed={p.approved}
                onClick={() => onToggleApproved(p)}
                className={cx(
                  'm-1 flex min-h-11 shrink-0 items-center rounded-inner px-3 text-xs',
                  p.approved
                    ? 'text-muted hover:text-accent'
                    : 'bg-active text-text hover:text-accent',
                )}
              >
                {p.approved ? '✓ zatwierdzony' : 'do zatwierdzenia'}
              </button>
            </div>
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

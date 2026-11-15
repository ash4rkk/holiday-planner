'use client'

import type { LeaveRegions } from '@planer/core'
import { cx } from '@/components/ui'
import { DayCell, LeaveStat } from './day-cell'
import {
  type DayIndex,
  isoDate,
  type LeaveAt,
  leaveSummary,
  MONTH_NAMES,
  monthWeeks,
  type PaintAt,
  type PlannerPeriod,
  WEEKDAYS,
} from './model'

/** Rok jako 12 siatek tygodni w kolumnach (telefon: 2, szerzej: 3–4). */
export function MonthsView({
  year,
  regions,
  periods,
  index,
  today,
  picking,
  onPick,
  onOpenMonth,
  paintAt,
  leaveAt,
  persons,
}: {
  year: number
  regions: LeaveRegions
  periods: PlannerPeriod[]
  index: DayIndex
  today: string
  picking: string | null
  onPick: (date: string) => void
  onOpenMonth: (month: number) => void
  paintAt?: PaintAt
  leaveAt: LeaveAt
  persons: string[]
}) {
  return (
    <div className="grid grid-cols-2 gap-1 md:grid-cols-3 xl:grid-cols-4">
      {MONTH_NAMES.map((name, m) => {
        const last = new Date(Date.UTC(year, m + 1, 0)).getUTCDate()
        const used = leaveSummary(
          periods,
          persons,
          isoDate(year, m, 1),
          isoDate(year, m, last),
          regions,
        )
        return (
          <section
            key={name}
            className={cx(
              'island flex flex-col gap-1 p-1.5',
              // bieżący miesiąc lekko wyróżniony
              today.slice(0, 7) === isoDate(year, m, 1).slice(0, 7) &&
                'border-accent/60 bg-active/30',
            )}
            aria-label={name}
          >
            <button
              type="button"
              onClick={() => onOpenMonth(m)}
              className="flex min-h-8 items-baseline justify-between px-1 text-left hover:text-accent"
            >
              <span className="text-sm font-bold">{name}</span>
              {used.length > 0 && (
                <span className="text-2xs text-muted tabular-nums">
                  <LeaveStat stats={used} persons={persons} />
                </span>
              )}
            </button>
            <div className="grid grid-cols-7 text-center text-2xs text-subtle">
              {WEEKDAYS.map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-px">
              {monthWeeks(year, m)
                .flat()
                .map((date, i) =>
                  date ? (
                    <DayCell
                      key={date}
                      date={date}
                      index={index}
                      today={today}
                      picking={picking}
                      onPick={onPick}
                      paintAt={paintAt}
                      leaveAt={leaveAt}
                    />
                  ) : (
                    <span key={`e${i}`} />
                  ),
                )}
            </div>
          </section>
        )
      })}
    </div>
  )
}

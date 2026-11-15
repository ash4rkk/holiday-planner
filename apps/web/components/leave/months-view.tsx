'use client'

import { type HolidayRegion, leaveInRange } from '@planer/core'
import { DayCell } from './day-cell'
import {
  type DayIndex,
  isoDate,
  MONTH_NAMES,
  monthWeeks,
  type PlannerPeriod,
  WEEKDAYS,
} from './model'

/** Rok jako 12 siatek tygodni w kolumnach (telefon: 2, szerzej: 3–4). */
export function MonthsView({
  year,
  region,
  periods,
  index,
  today,
  picking,
  onPick,
  onOpenMonth,
}: {
  year: number
  region: HolidayRegion
  periods: PlannerPeriod[]
  index: DayIndex
  today: string
  picking: string | null
  onPick: (date: string) => void
  onOpenMonth: (month: number) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-1 md:grid-cols-3 xl:grid-cols-4">
      {MONTH_NAMES.map((name, m) => {
        const last = new Date(Date.UTC(year, m + 1, 0)).getUTCDate()
        const used = leaveInRange(periods, isoDate(year, m, 1), isoDate(year, m, last), region)
        return (
          <section key={name} className="island flex flex-col gap-1 p-1.5" aria-label={name}>
            <button
              type="button"
              onClick={() => onOpenMonth(m)}
              className="flex min-h-8 items-baseline justify-between px-1 text-left hover:text-accent"
            >
              <span className="text-sm font-bold">{name}</span>
              {used > 0 && <span className="text-2xs text-muted tabular-nums">{used} dni</span>}
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

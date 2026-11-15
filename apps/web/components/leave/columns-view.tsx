'use client'

import { addDays, daysBetween, type LeaveRegions, weekdayOf } from '@planer/core'
import { useEffect, useRef } from 'react'
import { cx } from '@/components/ui'
import { dayTitle, HolidayMarks, LeaveStat, PendingMark } from './day-cell'
import {
  type DayIndex,
  ERASE_CELL,
  eventColor,
  eventTextColor,
  isoDate,
  type LeaveAt,
  leaveSummary,
  MONTH_NAMES,
  MONTH_SHORT,
  type PaintAt,
  type PlannerPeriod,
} from './model'

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1)
// 0 = niedziela
const WEEKDAY_SHORT = ['nd', 'pn', 'wt', 'śr', 'cz', 'pt', 'so']

/**
 * Rok jak planer ścienny: miesiące w kolumnach, dni w wierszach (1–31). Urlop to ciągły pas
 * w kolumnie miesiąca. Na telefonie przewija się w bok, numery dni i nagłówek zostają na miejscu.
 */
export function ColumnsView({
  year,
  regions,
  periods,
  index,
  today,
  picking,
  onPick,
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
  paintAt?: PaintAt
  leaveAt: LeaveAt
  persons: string[]
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const thisMonth = today.slice(0, 4) === String(year) ? Number(today.slice(5, 7)) - 1 : -1
  const lengths = MONTH_NAMES.map((_, m) => new Date(Date.UTC(year, m + 1, 0)).getUTCDate())

  // Bieżący miesiąc w polu widzenia (na telefonie mieści się ok. 6 kolumn).
  useEffect(() => {
    const el = scroller.current
    if (!el || today.slice(0, 4) !== String(year)) return
    const col = el.querySelector<HTMLElement>(`[data-month="${Number(today.slice(5, 7)) - 1}"]`)
    if (col) el.scrollLeft = Math.max(0, col.offsetLeft - el.clientWidth / 3)
  }, [year, today])

  return (
    // `contain-paint`: bez tego Chrome na telefonie liczy szerokość strony z całej tabeli (555 px
    // zamiast ekranu) i okna `fixed` (arkusz urlopu, menu) wychodzą poza ekran.
    <div className="island overflow-hidden contain-paint">
      <div ref={scroller} className="overflow-x-auto overflow-y-hidden overscroll-x-contain">
        <table className="w-full min-w-[720px] table-fixed border-separate border-spacing-0 text-xs tabular-nums">
          <thead>
            <tr>
              <th className="sticky top-0 left-0 z-10 w-8 border-b border-line bg-panel" />
              {MONTH_SHORT.map((name, m) => {
                const used = leaveSummary(
                  periods,
                  persons,
                  isoDate(year, m, 1),
                  isoDate(year, m, lengths[m] ?? 31),
                  regions,
                )
                return (
                  <th
                    key={name}
                    data-month={m}
                    title={MONTH_NAMES[m]}
                    className={cx(
                      'border-b border-l border-line px-1 py-1.5 text-left font-bold',
                      // bieżący miesiąc lekko wyróżniony: nagłówek w kolorze akcentu i tło kolumny
                      thisMonth === m ? 'bg-active text-accent' : 'bg-panel',
                    )}
                  >
                    <span className="block">{name}</span>
                    <span className="block min-h-4 text-2xs font-normal text-muted">
                      <LeaveStat stats={used} persons={persons} />
                    </span>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {DAYS.map((d) => (
              <tr key={d}>
                <th
                  scope="row"
                  className="sticky left-0 z-10 border-line bg-panel pr-1 text-right font-normal text-subtle not-last:border-b"
                >
                  {d}
                </th>
                {MONTH_SHORT.map((name, m) => {
                  if (d > (lengths[m] ?? 31)) {
                    return (
                      <td key={name} className="border-l border-line bg-raised not-last:border-b" />
                    )
                  }
                  const date = isoDate(year, m, d)
                  const paint = paintAt?.(date) ?? null
                  const leave = leaveAt(date)
                  const period = Boolean(leave)
                  const off = index.off(date)
                  const holidays = index.holidays(date)
                  const events = index.events(date)
                  const trips = index.trips(date)
                  const title = dayTitle(date, index)
                  const flagTrip = trips.find((t) => t.flag)
                  // Wydarzenia: wielodniowe jako wypełnienie od lewej (najwyżej dwa) z jednym
                  // pionowym tytułem wzdłuż odcinka w tym miesiącu; jednodniowe (i reszta) poziomo
                  // w dniu, kolejne jako „+N”.
                  const bars = events.filter((e) => e.startDate !== e.endDate).slice(0, 2)
                  const spines = bars.flatMap((e, i) => {
                    const t = titleDay(e, year, m, lengths)
                    return t && t.date === date && t.days > 1 ? [{ e, i, ...t }] : []
                  })
                  const starts = events.filter((e) => {
                    if (e.startDate === e.endDate) return true
                    if (spines.some((s) => s.e === e)) return false
                    const t = titleDay(e, year, m, lengths)
                    const onBar = bars.includes(e)
                    // pas bez miejsca na pionowy tytuł (1 dzień w miesiącu) albo trzecie wydarzenie
                    return t?.date === date && (!onBar || t.days === 1)
                  })
                  // Pas urlopu: bez kreski między kolejnymi dniami tego samego okresu.
                  const nextDate = isoDate(year, m, d + 1)
                  const nextSame =
                    d < (lengths[m] ?? 31) &&
                    leaveAt(nextDate)?.who === leave?.who &&
                    Boolean(leaveAt(nextDate))
                  return (
                    <td
                      key={name}
                      className={cx(
                        'border-l border-line p-0',
                        !(period && nextSame) && 'border-b',
                        !period && off && 'bg-raised',
                        !period && !off && thisMonth === m && 'bg-active/40',
                      )}
                    >
                      <button
                        type="button"
                        data-date={date}
                        onClick={() => onPick(date)}
                        // miejsce z prawej na pionowe tytuły wydarzeń i flagę wyjazdu
                        style={{ paddingRight: 4 + bars.length * 16 + (flagTrip?.flag ? 20 : 0) }}
                        aria-label={`${d} ${MONTH_NAMES[m]}${period ? (leave?.approved ? ', urlop' : ', urlop do zatwierdzenia') : ''}${title ? `, ${title}` : ''}`}
                        className={cx(
                          'relative flex h-8 w-full min-w-11 items-center gap-1 px-1 text-left',
                          leave
                            ? leave.cls
                            : paint === 'erase'
                              ? ERASE_CELL
                              : off
                                ? 'text-subtle'
                                : 'text-muted',
                          picking === date && 'ring-2 ring-accent ring-inset',
                          date === today && !period && 'font-bold text-text',
                          !period && 'hover:text-accent',
                        )}
                      >
                        {!period &&
                          bars.map((e) => (
                            // Wypełnienie od lewej: kolor wydarzenia gaśnie w prawo (osobna warstwa,
                            // żeby nie zasłaniać pasków dni bez liczenia). Na urlopie nic: kolor
                            // urlopu wygrywa, wydarzenie widać po pionowym tytule.
                            <span
                              key={e.calendarId + e.uid}
                              aria-hidden="true"
                              style={{
                                backgroundImage: `linear-gradient(to right, color-mix(in srgb, ${eventColor(e)} 42%, transparent), color-mix(in srgb, ${eventColor(e)} 8%, transparent))`,
                              }}
                              className={cx(
                                'pointer-events-none absolute inset-x-0',
                                e.startDate === date ? 'top-0.5 rounded-tl-[4px]' : 'top-0',
                                e.endDate === date ? 'bottom-0.5 rounded-bl-[4px]' : 'bottom-0',
                              )}
                            />
                          ))}
                        {spines.map((s) => (
                          // Tytuł obrócony wzdłuż wydarzenia przy prawej krawędzi, czytany od dołu,
                          // wyśrodkowany na odcinku (przy parzystej liczbie dni na linii między
                          // dwoma środkowymi).
                          <span
                            key={`t${s.e.calendarId}${s.e.uid}`}
                            aria-hidden="true"
                            style={{
                              right: 1 + s.i * 16,
                              height: s.days * ROW_PX - 8,
                              top: s.half ? `calc(50% + ${ROW_PX / 2}px)` : '50%',
                            }}
                            className="absolute z-[1] w-4 -translate-y-1/2 rotate-180 truncate text-center text-2xs leading-4 font-bold text-ev-label [paint-order:stroke_fill] [-webkit-text-stroke:2px_color-mix(in_srgb,var(--color-ev-label-outline)_60%,transparent)] [writing-mode:vertical-rl]"
                          >
                            {s.e.title}
                          </span>
                        ))}
                        {/* Stały układ: dzień tygodnia, tytuł wydarzenia, znaczki świąt z prawej. */}
                        <span className="w-4 shrink-0 text-2xs">
                          {WEEKDAY_SHORT[weekdayOf(date)]}
                        </span>
                        {starts.length > 0 && (
                          <span
                            className="min-w-0 truncate text-2xs"
                            style={
                              !period && starts[0]
                                ? { color: eventTextColor(starts[0]) }
                                : undefined
                            }
                          >
                            {starts[0]?.title}
                          </span>
                        )}
                        {starts.length > 1 && (
                          <span className="shrink-0 text-2xs">+{starts.length - 1}</span>
                        )}
                        <span className="ml-auto flex shrink-0 items-center gap-0.5">
                          <HolidayMarks marks={holidays} onLeave={!!period} />
                          {leave && !leave.approved && <PendingMark />}
                        </span>
                        {flagTrip?.flag ? (
                          // Każdy dzień wyjazdu: flaga kraju (wyjazd bez kraju: kreska).
                          <span
                            aria-hidden="true"
                            style={{ right: 4 + bars.length * 16 }}
                            className="absolute top-1/2 flex h-[11px] w-4 -translate-y-1/2"
                          >
                            {flagTrip.flag}
                          </span>
                        ) : (
                          trips.length > 0 && (
                            <span
                              aria-hidden="true"
                              className="absolute inset-y-1 right-0.5 w-1 rounded-full bg-trip"
                            />
                          )
                        )}
                        {date === today && (
                          <span
                            aria-hidden="true"
                            className="absolute inset-x-0 bottom-0 h-0.5 bg-sel"
                          />
                        )}
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** Wysokość wiersza dnia: przycisk `h-8` i kreska pod nim. */
const ROW_PX = 33

/**
 * Dzień z tytułem wydarzenia wielodniowego w kolumnie miesiąca: środek odcinka w tym miesiącu.
 * `half` = parzysta liczba dni, tytuł przesunięty o pół wiersza w dół; `days` = długość odcinka.
 */
function titleDay(
  e: { startDate: string; endDate: string },
  year: number,
  m: number,
  lengths: number[],
): { date: string; half: boolean; days: number } | null {
  if (e.startDate === e.endDate) return null
  const first = isoDate(year, m, 1)
  const last = isoDate(year, m, lengths[m] ?? 31)
  const from = e.startDate < first ? first : e.startDate
  const to = e.endDate > last ? last : e.endDate
  const n = daysBetween(from, to) + 1
  return { date: addDays(from, Math.floor((n - 1) / 2)), half: n % 2 === 0, days: n }
}

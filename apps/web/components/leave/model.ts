import {
  addDays,
  type DayEvent,
  eventsByDay,
  type Holiday,
  type HolidayRegion,
  holidaysBetween,
  isWeekend,
} from '@planer/core'
import { useMemo } from 'react'

// Dane planera urlopów po stronie klienta: co jest w danym dniu (urlop, święta, wyjazdy, wydarzenia).

export interface PlannerPeriod {
  id: string
  startDate: string
  endDate: string
  note: string | null
  createdBy: string | null
  createdAt: Date
}

export interface PlannerTrip {
  id: string
  title: string
  startDate: string
  endDate: string
}

export interface PlannerCalendar {
  id: string
  name: string
}

export interface Layers {
  pl: boolean
  bb: boolean
  trips: boolean
  hiddenCalendars: string[]
}

export const DEFAULT_LAYERS: Layers = { pl: true, bb: true, trips: true, hiddenCalendars: [] }

export type LeaveView = 'months' | 'gantt' | 'list' | 'month'

export const VIEW_LABELS: Record<LeaveView, string> = {
  months: 'miesiące',
  gantt: 'oś roku',
  list: 'lista',
  month: 'miesiąc',
}

export const isLeaveView = (v: unknown): v is LeaveView => typeof v === 'string' && v in VIEW_LABELS

const monthName = new Intl.DateTimeFormat('pl-PL', { month: 'long', timeZone: 'UTC' })
export const MONTH_NAMES = Array.from({ length: 12 }, (_, m) =>
  monthName.format(new Date(Date.UTC(2027, m, 1))),
)
export const WEEKDAYS = ['pn', 'wt', 'śr', 'cz', 'pt', 'so', 'nd']

const pad = (n: number) => String(n).padStart(2, '0')
export const isoDate = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`

/** Tygodnie miesiąca od poniedziałku; `null` = dzień z innego miesiąca. */
export function monthWeeks(year: number, month: number): (string | null)[][] {
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const lead = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7
  const cells: (string | null)[] = Array(lead).fill(null)
  for (let d = 1; d <= days; d++) cells.push(isoDate(year, month, d))
  while (cells.length % 7) cells.push(null)
  const weeks: (string | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

export interface DayIndex {
  from: string
  to: string
  period: (date: string) => PlannerPeriod | undefined
  trips: (date: string) => PlannerTrip[]
  events: (date: string) => DayEvent[]
  /** widoczne święta (wg warstw) */
  holidays: (date: string) => Holiday[]
  /** dzień bez pracy w regionie liczenia (weekend albo święto) */
  off: (date: string) => boolean
  visibleEvents: DayEvent[]
  visibleTrips: PlannerTrip[]
}

export function useDayIndex(
  year: number,
  region: HolidayRegion,
  periods: PlannerPeriod[],
  trips: PlannerTrip[],
  events: DayEvent[],
  layers: Layers,
): DayIndex {
  return useMemo(() => {
    const from = `${year}-01-01`
    const to = `${year}-12-31`
    const byPeriod = new Map<string, PlannerPeriod>()
    for (const p of periods) {
      for (
        let d = p.startDate < from ? from : p.startDate;
        d <= p.endDate && d <= to;
        d = addDays(d, 1)
      ) {
        if (!byPeriod.has(d)) byPeriod.set(d, p)
      }
    }
    const visibleTrips = layers.trips ? trips : []
    const byTrip = eventsByDay(
      visibleTrips.map((t) => ({ ...t, uid: t.id, startTime: null, endTime: null, allDay: true })),
      from,
      to,
    )
    const hidden = new Set(layers.hiddenCalendars)
    const visibleEvents = events.filter((e) => !hidden.has(e.calendarId))
    const byEvent = eventsByDay(visibleEvents, from, to)
    const shown = new Map<string, Holiday[]>()
    const regions: HolidayRegion[] = [
      ...(layers.pl ? ['PL' as const] : []),
      ...(layers.bb ? ['DE-BB' as const] : []),
    ]
    for (const r of regions) {
      for (const h of holidaysBetween(r, from, to)) {
        const list = shown.get(h.date)
        if (list) list.push(h)
        else shown.set(h.date, [h])
      }
    }
    const counted = new Set(holidaysBetween(region, from, to).map((h) => h.date))
    const tripById = new Map(trips.map((t) => [t.id, t]))
    return {
      from,
      to,
      period: (d) => byPeriod.get(d),
      trips: (d) =>
        (byTrip.get(d) ?? []).map((t) => tripById.get(t.uid)).filter((t): t is PlannerTrip => !!t),
      events: (d) => byEvent.get(d) ?? [],
      holidays: (d) => shown.get(d) ?? [],
      off: (d) => isWeekend(d) || counted.has(d),
      visibleEvents,
      visibleTrips,
    }
  }, [year, region, periods, trips, events, layers])
}

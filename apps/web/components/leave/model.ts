import {
  addDays,
  type DayEvent,
  eventsByDay,
  freeSpan,
  type Holiday,
  type HolidayRegion,
  holidaysBetween,
  isWeekend,
  type LeaveRegions,
  leaveInRange,
  periodLeaveDays,
  personLeaveDays,
  regionOf,
} from '@planer/core'
import { type ReactNode, useMemo } from 'react'

// Dane planera urlopów po stronie klienta: co jest w danym dniu (urlop, święta, wyjazdy, wydarzenia).

export interface PlannerPeriod {
  id: string
  startDate: string
  endDate: string
  note: string | null
  /** imię profilu; `null` = wspólny */
  person: string | null
  /** zatwierdzony w pracy */
  approved: boolean
  createdBy: string | null
  createdAt: Date
}

export interface PlannerTrip {
  id: string
  title: string
  startDate: string
  endDate: string
  /** flaga kraju wyrenderowana na serwerze (bundel flag zostaje po stronie serwera) */
  flag?: ReactNode
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

export type LeaveView = 'months' | 'columns' | 'month'

export const VIEW_LABELS: Record<LeaveView, string> = {
  columns: 'kolumny',
  months: 'miesiące',
  month: 'miesiąc',
}

export const isLeaveView = (v: unknown): v is LeaveView => typeof v === 'string' && v in VIEW_LABELS

/** Dzień urlopu: pełny akcent, żeby urlop był widoczny z daleka (wszystkie widoki). */
export const LEAVE_CELL = 'bg-accent font-bold text-on-accent'

/** Czyj urlop jest w dniu: imię osoby albo `null` = oboje (wspólny albo każde swój). */
export type Who = string | null

const PERSON_CELL = ['bg-person-a font-bold text-on-accent', 'bg-person-b font-bold text-on-accent']
const PERSON_BG = ['bg-person-a', 'bg-person-b']
const PENDING_TONE = [
  '[--leave-tone:var(--color-person-a)]',
  '[--leave-tone:var(--color-person-b)]',
]

/**
 * Klasa dnia urlopu: oboje w akcencie, jedna osoba w swoim kolorze. Do zatwierdzenia: jasne tło
 * z obrysem w tym samym kolorze (`.leave-pending`).
 */
export function leaveCellClass(who: Who, persons: string[], approved = true): string {
  if (!approved) {
    const tone =
      who === null
        ? '[--leave-tone:var(--color-accent)]'
        : (PENDING_TONE[Math.max(0, persons.indexOf(who)) % 2] as string)
    return `leave-pending ${tone}`
  }
  if (who === null) return LEAVE_CELL
  return PERSON_CELL[Math.max(0, persons.indexOf(who)) % 2] as string
}

/** Samo tło (legenda, paski osi, chipy). */
export function leaveBg(who: Who, persons: string[]): string {
  if (who === null) return 'bg-accent'
  return PERSON_BG[Math.max(0, persons.indexOf(who)) % 2] as string
}

/** Kto ma urlop według listy okresów dnia (`undefined` = nikt). */
export function whoOf(list: { person: string | null }[]): Who | undefined {
  if (!list.length) return undefined
  if (list.some((p) => p.person === null)) return null
  const names = new Set(list.map((p) => p.person as string))
  return names.size === 1 ? [...names][0] : null
}

export const personLabel = (who: Who) => who ?? 'oboje'

/** Dzień urlopu tak, jak go widać (z podglądem malowania): kto i jaką klasą. */
export type LeaveAt = (date: string) =>
  | {
      who: Who
      cls: string
      /** zużywa komuś dzień urlopu */
      counts: boolean
      /** wszystkie okresy dnia zatwierdzone */
      approved: boolean
    }
  | undefined
/** Dzień pod gumką w trakcie malowania. */
export const ERASE_CELL = 'bg-raised text-subtle line-through'

/** Malowanie w toku: czy dzień jest w zakresie i czym (dodanie albo gumka). */
export type PaintAt = (date: string) => 'add' | 'erase' | null

/** Urlop tak, jak go widać w tej chwili (z podglądem malowania). */
export function leaveShown(period: unknown, paint: 'add' | 'erase' | null): boolean {
  return paint === 'add' || (Boolean(period) && paint !== 'erase')
}

const monthShort = new Intl.DateTimeFormat('pl-PL', { month: 'short', timeZone: 'UTC' })
export const MONTH_SHORT = Array.from({ length: 12 }, (_, m) =>
  monthShort.format(new Date(Date.UTC(2027, m, 1))).replace('.', ''),
)

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
  /** wszystkie okresy w dniu (osoby mogą mieć osobne) */
  periods: (date: string) => PlannerPeriod[]
  trips: (date: string) => PlannerTrip[]
  events: (date: string) => DayEvent[]
  /** widoczne święta (wg warstw) */
  holidays: (date: string) => Holiday[]
  /** dzień wolny dla wszystkich (weekend albo święto w regionie każdej osoby) */
  off: (date: string) => boolean
  visibleEvents: DayEvent[]
  visibleTrips: PlannerTrip[]
}

export function useDayIndex(
  year: number,
  workRegions: HolidayRegion[],
  periods: PlannerPeriod[],
  trips: PlannerTrip[],
  events: DayEvent[],
  layers: Layers,
): DayIndex {
  return useMemo(() => {
    const from = `${year}-01-01`
    const to = `${year}-12-31`
    const byPeriod = new Map<string, PlannerPeriod[]>()
    for (const p of periods) {
      for (
        let d = p.startDate < from ? from : p.startDate;
        d <= p.endDate && d <= to;
        d = addDays(d, 1)
      ) {
        const list = byPeriod.get(d)
        if (list) list.push(p)
        else byPeriod.set(d, [p])
      }
    }
    const visibleTrips = layers.trips ? trips : []
    const byTrip = eventsByDay(
      visibleTrips.map((t) => ({
        ...t,
        uid: t.id,
        startTime: null,
        endTime: null,
        allDay: true,
        color: null,
      })),
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
    // Święto „dla wszystkich”: wolne w regionie każdej z osób.
    const perRegion = workRegions.map(
      (r) => new Set(holidaysBetween(r, from, to).map((h) => h.date)),
    )
    const counted = new Set(
      [...(perRegion[0] ?? [])].filter((d) => perRegion.every((set) => set.has(d))),
    )
    const tripById = new Map(trips.map((t) => [t.id, t]))
    return {
      from,
      to,
      period: (d) => byPeriod.get(d)?.[0],
      periods: (d) => byPeriod.get(d) ?? [],
      trips: (d) =>
        (byTrip.get(d) ?? []).map((t) => tripById.get(t.uid)).filter((t): t is PlannerTrip => !!t),
      events: (d) => byEvent.get(d) ?? [],
      holidays: (d) => shown.get(d) ?? [],
      off: (d) => isWeekend(d) || counted.has(d),
      visibleEvents,
      visibleTrips,
    }
  }, [year, workRegions, periods, trips, events, layers])
}

/**
 * Dni urlopu w zakresie na osobę, tylko niezerowe. Gdy każda osoba ma tyle samo — jedna pozycja
 * bez osoby („10 dni”); inaczej kropka osoby i liczba („● 3”).
 */
export function leaveSummary(
  periods: PlannerPeriod[],
  persons: string[],
  from: string,
  to: string,
  regions: LeaveRegions,
): { person: string | null; days: number }[] {
  if (!persons.length) {
    const n = leaveInRange(periods, from, to, regions.fallback)
    return n ? [{ person: null, days: n }] : []
  }
  const counts = persons.map((p) => ({
    person: p as string | null,
    days: personLeaveDays(periods, p, from, to, regionOf(regions, p)),
  }))
  const used = counts.filter((c) => c.days > 0)
  if (!used.length) return []
  if (used.length === persons.length && used.every((c) => c.days === used[0]?.days)) {
    return [{ person: null, days: used[0]?.days ?? 0 }]
  }
  return used
}

const EV_HUES: [number, string][] = [
  [15, 'red'],
  [40, 'orange'],
  [65, 'yellow'],
  [150, 'green'],
  [190, 'teal'],
  [250, 'blue'],
  [290, 'purple'],
  [345, 'pink'],
  [361, 'red'],
]

/** Odcień etykiety ('#rrggbb') → najbliższy stonowany kolor wydarzeń z motywu (`--ev-*`). */
export function eventTone(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255) as [
    number,
    number,
    number,
  ]
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  const l = (max + min) / 2
  const sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  if (sat < 0.15) return 'gray'
  const h = (max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60
  const hue = (h + 360) % 360
  return EV_HUES.find(([limit]) => hue < limit)?.[1] ?? 'red'
}

/** Kolor wydarzenia: etykieta z TimeTree w tonacji motywu albo domyślny pomarańcz. */
export const eventColor = (e: { color: string | null }) =>
  `var(--ev-${e.color ? eventTone(e.color) : 'orange'})`

/** Tytuł w kolorze wydarzenia, zmieszany z kolorem tekstu — czytelny w obu motywach. */
export const eventTextColor = (e: { color: string | null }) =>
  `color-mix(in srgb, ${eventColor(e)} 70%, var(--text))`

const daysWord = (n: number) => (n === 1 ? 'dzień' : 'dni')

/** „5 dni urlopu · 9 wolnego”, przy wspólnym okresie i różnych świętach „Arek 11 · Wera 13 dni urlopu”. */
export function periodDaysText(
  p: { startDate: string; endDate: string; person: string | null },
  persons: string[],
  regions: LeaveRegions,
): string {
  const list = periodLeaveDays(p, persons, regions)
  const owner = p.person ?? persons[0]
  const free = freeSpan(p.startDate, p.endDate, owner ? regionOf(regions, owner) : regions.fallback)
  const days =
    list.length === 1
      ? `${list[0]?.days ?? 0} ${daysWord(list[0]?.days ?? 0)} urlopu`
      : `${list.map((x) => `${x.person} ${x.days}`).join(' · ')} dni urlopu`
  return `${days} · ${free} ${daysWord(free)} wolnego`
}

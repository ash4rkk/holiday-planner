import { addDays, dateRange } from './dates'

// Święta ustawowe (dni wolne od pracy) do planera urlopów. Daty 'YYYY-MM-DD', liczone na UTC.
// Bez Temporal — kod działa też w przeglądarce.

export type HolidayRegion = 'PL' | 'DE-BB'

export const HOLIDAY_REGIONS: HolidayRegion[] = ['PL', 'DE-BB']

export const REGION_LABEL: Record<HolidayRegion, string> = {
  PL: 'Polska',
  'DE-BB': 'Brandenburgia',
}

export interface Holiday {
  date: string
  region: HolidayRegion
  /** nazwa po polsku */
  name: string
  /** nazwa w języku kraju (dla PL to samo co `name`) */
  localName: string
}

/** Niedziela Wielkanocna (algorytm Meeusa/Jonesa/Butchera, kalendarz gregoriański). */
export function easter(year: number): string {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

type Rule = [monthDayOrEasterOffset: string | number, name: string, localName?: string]

const PL: Rule[] = [
  ['01-01', 'Nowy Rok'],
  ['01-06', 'Trzech Króli'],
  [0, 'Wielkanoc'],
  [1, 'Poniedziałek Wielkanocny'],
  ['05-01', 'Święto Pracy'],
  ['05-03', 'Święto Konstytucji 3 Maja'],
  [49, 'Zielone Świątki'],
  [60, 'Boże Ciało'],
  ['08-15', 'Wniebowzięcie NMP'],
  ['11-01', 'Wszystkich Świętych'],
  ['11-11', 'Święto Niepodległości'],
  ['12-24', 'Wigilia'],
  ['12-25', 'Boże Narodzenie'],
  ['12-26', 'drugi dzień świąt'],
]

const DE_BB: Rule[] = [
  ['01-01', 'Nowy Rok', 'Neujahr'],
  [-2, 'Wielki Piątek', 'Karfreitag'],
  [0, 'Wielkanoc', 'Ostersonntag'],
  [1, 'Poniedziałek Wielkanocny', 'Ostermontag'],
  ['05-01', 'Święto Pracy', 'Tag der Arbeit'],
  [39, 'Wniebowstąpienie', 'Christi Himmelfahrt'],
  [49, 'Zielone Świątki', 'Pfingstsonntag'],
  [50, 'drugi dzień Zielonych Świątek', 'Pfingstmontag'],
  ['10-03', 'Dzień Jedności Niemiec', 'Tag der Deutschen Einheit'],
  ['10-31', 'Dzień Reformacji', 'Reformationstag'],
  ['12-25', 'Boże Narodzenie', '1. Weihnachtstag'],
  ['12-26', 'drugi dzień świąt', '2. Weihnachtstag'],
]

const RULES: Record<HolidayRegion, Rule[]> = { PL, 'DE-BB': DE_BB }

const cache = new Map<string, Holiday[]>()

/** Święta regionu w roku, posortowane po dacie. */
export function holidays(region: HolidayRegion, year: number): Holiday[] {
  const key = `${region}:${year}`
  const hit = cache.get(key)
  if (hit) return hit
  const base = easter(year)
  const list = RULES[region]
    .filter(([when]) => !(region === 'PL' && when === '12-24' && year < 2025))
    .map(([when, name, localName]) => ({
      date: typeof when === 'number' ? addDays(base, when) : `${year}-${when}`,
      region,
      name,
      localName: localName ?? name,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
  cache.set(key, list)
  return list
}

/** Święta regionu w zakresie dat (włącznie), np. dla widoku roku. */
export function holidaysBetween(region: HolidayRegion, from: string, to: string): Holiday[] {
  const out: Holiday[] = []
  for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) {
    for (const h of holidays(region, y)) if (h.date >= from && h.date <= to) out.push(h)
  }
  return out
}

export function holidayOn(date: string, region: HolidayRegion): Holiday | undefined {
  return holidays(region, Number(date.slice(0, 4))).find((h) => h.date === date)
}

/** 0 = niedziela … 6 = sobota */
export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay()
}

export function isWeekend(date: string): boolean {
  const d = weekdayOf(date)
  return d === 0 || d === 6
}

export function isWorkday(date: string, region: HolidayRegion): boolean {
  return !isWeekend(date) && !holidayOn(date, region)
}

/** Ile dni urlopu zużywa okres: dni robocze od `start` do `end` włącznie. */
export function leaveDays(start: string, end: string, region: HolidayRegion): number {
  return dateRange(start, end).filter((d) => isWorkday(d, region)).length
}

/** Ile dni wolnego daje okres razem z przylegającymi weekendami i świętami. */
export function freeSpan(start: string, end: string, region: HolidayRegion): number {
  let from = start
  let to = end
  while (!isWorkday(addDays(from, -1), region)) from = addDays(from, -1)
  while (!isWorkday(addDays(to, 1), region)) to = addDays(to, 1)
  return dateRange(from, to).length
}

export interface LeavePeriodDates {
  startDate: string
  endDate: string
}

/** Suma dni urlopu w zakresie dat; okresy liczą się tylko częścią w zakresie. */
export function leaveInRange(
  periods: LeavePeriodDates[],
  from: string,
  to: string,
  region: HolidayRegion,
): number {
  let sum = 0
  for (const p of periods) {
    const a = p.startDate > from ? p.startDate : from
    const b = p.endDate < to ? p.endDate : to
    if (a <= b) sum += leaveDays(a, b, region)
  }
  return sum
}

/** Suma dni urlopu w roku; okres na przełomie lat liczy się w każdym roku tylko swoją częścią. */
export function leaveInYear(
  periods: LeavePeriodDates[],
  year: number,
  region: HolidayRegion,
): number {
  return leaveInRange(periods, `${year}-01-01`, `${year}-12-31`, region)
}

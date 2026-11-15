import ICAL from 'ical.js'
import type { EventOccurrence } from './calendar-events'
import { addDays } from './dates'

// Plik iCalendar (.ics) → wystąpienia wydarzeń w oknie dat, w czasie lokalnym `timeZone`.
// Powtarzające się (RRULE, EXDATE, wyjątki z RECURRENCE-ID) rozwija ical.js.

export const ICS_MAX_BYTES = 5 * 1024 * 1024
/** Najwięcej wystąpień z jednego kalendarza — chroni bazę przed kalendarzem „co minutę”. */
export const MAX_OCCURRENCES = 5000
const MAX_PER_EVENT = 1500

export interface IcsWindow {
  from: string
  to: string
}

/** Okno importu: od początku zeszłego roku do końca roku za dwa lata. */
export function importWindow(today: string): IcsWindow {
  const year = Number(today.slice(0, 4))
  return { from: `${year - 1}-01-01`, to: `${year + 2}-12-31` }
}

const parts = (timeZone: string) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })

/** Data i godzina chwili `ms` w strefie `timeZone`. */
export function localDateTime(ms: number, timeZone: string): { date: string; time: string } {
  const p = Object.fromEntries(
    parts(timeZone)
      .formatToParts(new Date(ms))
      .map((x) => [x.type, x.value]),
  )
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` }
}

const pad = (n: number) => String(n).padStart(2, '0')

function toLocal(t: ICAL.Time, timeZone: string): { date: string; time: string | null } {
  const date = `${t.year}-${pad(t.month)}-${pad(t.day)}`
  if (t.isDate) return { date, time: null }
  // Czas „pływający” (bez strefy) bierzemy tak, jak jest zapisany.
  if (!t.zone || t.zone === ICAL.Timezone.localTimezone) {
    return { date, time: `${pad(t.hour)}:${pad(t.minute)}` }
  }
  return localDateTime(t.toUnixTime() * 1000, timeZone)
}

function occurrence(
  uid: string,
  title: string,
  start: ICAL.Time,
  end: ICAL.Time | null,
  timeZone: string,
): EventOccurrence {
  const s = toLocal(start, timeZone)
  const allDay = start.isDate
  let endDate = s.date
  let endTime: string | null = null
  if (end) {
    const e = toLocal(end, timeZone)
    if (allDay) {
      // DTEND całodniowego jest wyłączny.
      endDate = addDays(e.date, -1)
    } else {
      endTime = e.time
      endDate = e.date
      // Koniec o północy należy jeszcze do dnia wcześniej.
      if (e.time === '00:00' && e.date > s.date) endDate = addDays(e.date, -1)
    }
    if (endDate < s.date) endDate = s.date
  }
  return {
    uid: `${uid}@${s.date}${s.time ? `T${s.time}` : ''}`,
    title: title.trim() || 'bez tytułu',
    startDate: s.date,
    endDate,
    startTime: s.time,
    endTime,
    allDay,
  }
}

export interface IcsResult {
  events: EventOccurrence[]
  /** nazwa kalendarza z pliku (X-WR-CALNAME), jeśli jest */
  name: string | null
  truncated: boolean
}

export function parseIcs(text: string, window: IcsWindow, timeZone = 'Europe/Warsaw'): IcsResult {
  const root = new ICAL.Component(ICAL.parse(text))
  for (const tz of root.getAllSubcomponents('vtimezone')) {
    const id = tz.getFirstPropertyValue('tzid')
    if (typeof id === 'string' && !ICAL.TimezoneService.has(id)) ICAL.TimezoneService.register(tz)
  }
  const name = root.getFirstPropertyValue('x-wr-calname')

  // Wyjątki (RECURRENCE-ID) przypinamy do wydarzenia głównego o tym samym UID.
  const masters = new Map<string, ICAL.Event>()
  const exceptions: ICAL.Event[] = []
  for (const vevent of root.getAllSubcomponents('vevent')) {
    const ev = new ICAL.Event(vevent)
    if (ev.isRecurrenceException()) exceptions.push(ev)
    else masters.set(ev.uid || `${masters.size}`, ev)
  }
  for (const ex of exceptions) {
    const master = masters.get(ex.uid)
    if (master) master.relateException(ex)
    else masters.set(`${ex.uid}#${ex.recurrenceId}`, ex)
  }

  const from = ICAL.Time.fromDateString(addDays(window.from, -1))
  const to = ICAL.Time.fromDateString(addDays(window.to, 1))
  const events: EventOccurrence[] = []
  let truncated = false

  const cancelled = (ev: ICAL.Event) =>
    String(ev.component.getFirstPropertyValue('status') ?? '').toUpperCase() === 'CANCELLED'

  const push = (o: EventOccurrence) => {
    if (o.endDate < window.from || o.startDate > window.to) return
    if (events.length >= MAX_OCCURRENCES) {
      truncated = true
      return
    }
    events.push(o)
  }

  for (const [uid, ev] of masters) {
    if (!ev.startDate || cancelled(ev)) continue
    if (!ev.isRecurring()) {
      push(occurrence(uid, ev.summary ?? '', ev.startDate, ev.endDate ?? null, timeZone))
      continue
    }
    const it = ev.iterator()
    let n = 0
    for (let next = it.next(); next; next = it.next()) {
      if (next.compare(to) > 0 || ++n > MAX_PER_EVENT) break
      const d = ev.getOccurrenceDetails(next)
      if (d.endDate.compare(from) < 0) continue
      if (cancelled(d.item)) continue
      push(occurrence(uid, d.item.summary ?? '', d.startDate, d.endDate, timeZone))
    }
  }
  events.sort((a, b) => a.startDate.localeCompare(b.startDate))
  return { events, name: typeof name === 'string' && name.trim() ? name.trim() : null, truncated }
}

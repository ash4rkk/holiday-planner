import type { EventOccurrence } from './calendar-events'
import { addDays } from './dates'
import { type IcsWindow, localDateTime, parseIcs } from './ics'

// TimeTree nie ma oficjalnego API ani eksportu. Korzystamy z API aplikacji webowej tak jak
// timetree-exporter (logowanie e-mailem i hasłem → cookie `_session_id`). Nieoficjalne: może
// przestać działać po zmianie po stronie TimeTree. Tylko serwer (worker, web); host stały.

const BASE = 'https://timetreeapp.com/api/v1'
const HEADERS = { 'Content-Type': 'application/json', 'X-Timetreea': 'web/2.1.0/en' }
const TIMEOUT_MS = 20_000
const MAX_PAGES = 200

export interface TimeTreeCalendar {
  id: string
  name: string
}

/** Wydarzenie tak, jak zwraca je API TimeTree (tylko pola, których używamy). */
export interface TimeTreeEvent {
  id?: string
  uuid?: string
  title?: string | null
  all_day?: boolean
  start_at?: number
  start_timezone?: string | null
  end_at?: number
  end_timezone?: string | null
  recurrences?: string[] | null
  parent_id?: string | null
  recurrence_id?: number | null
  deactivated_at?: number | null
  /** 2 = wspomnienie/notatka bez daty w kalendarzu */
  category?: number | null
}

export class TimeTreeError extends Error {}

export function timetreeConfigured(env = process.env): boolean {
  return Boolean(env.TIMETREE_EMAIL && env.TIMETREE_PASSWORD)
}

export class TimeTreeClient {
  private session: string | undefined

  constructor(
    private email: string,
    private password: string,
  ) {}

  private async login(): Promise<void> {
    const res = await fetch(`${BASE}/auth/email/signin`, {
      method: 'PUT',
      headers: HEADERS,
      body: JSON.stringify({
        uid: this.email,
        password: this.password,
        uuid: crypto.randomUUID().replaceAll('-', ''),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) throw new TimeTreeError(`logowanie do TimeTree: ${res.status}`)
    const cookie = res.headers
      .getSetCookie()
      .map((c) => /(?:^|;\s*)_session_id=([^;]+)/.exec(c)?.[1])
      .find(Boolean)
    if (!cookie) throw new TimeTreeError('TimeTree nie zwrócił sesji')
    this.session = cookie
  }

  private async get(path: string, retried = false): Promise<unknown> {
    if (!this.session) await this.login()
    const res = await fetch(`${BASE}${path}`, {
      headers: { ...HEADERS, Cookie: `_session_id=${this.session}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (res.status === 401 && !retried) {
      this.session = undefined
      return this.get(path, true)
    }
    if (!res.ok) throw new TimeTreeError(`TimeTree ${path.split('?')[0]}: ${res.status}`)
    return res.json()
  }

  async calendars(): Promise<TimeTreeCalendar[]> {
    const json = (await this.get('/calendars?since=0')) as {
      calendars?: { id: string | number; name?: string; deactivated_at?: number | null }[]
    }
    return (json.calendars ?? [])
      .filter((c) => !c.deactivated_at)
      .map((c) => ({ id: String(c.id), name: c.name?.trim() || 'kalendarz' }))
  }

  /** Wszystkie wydarzenia kalendarza (API oddaje je partiami, `chunk` = jest dalej). */
  async events(calendarId: string): Promise<TimeTreeEvent[]> {
    const out: TimeTreeEvent[] = []
    let since = 0
    for (let page = 0; page < MAX_PAGES; page++) {
      const json = (await this.get(
        `/calendar/${encodeURIComponent(calendarId)}/events/sync?since=${since}`,
      )) as { events?: TimeTreeEvent[]; chunk?: boolean; since?: number }
      out.push(...(json.events ?? []))
      if (!json.chunk || typeof json.since !== 'number' || json.since === since) break
      since = json.since
    }
    return out
  }
}

let shared: TimeTreeClient | undefined

/** Jeden klient na proces (sesja zostaje w pamięci), dane logowania z env. */
export function timetreeClient(env = process.env): TimeTreeClient {
  if (!env.TIMETREE_EMAIL || !env.TIMETREE_PASSWORD) {
    throw new TimeTreeError('brak TIMETREE_EMAIL / TIMETREE_PASSWORD')
  }
  shared ??= new TimeTreeClient(env.TIMETREE_EMAIL, env.TIMETREE_PASSWORD)
  return shared
}

// ---------- mapowanie na iCalendar ----------

const icsDate = (date: string) => date.replaceAll('-', '')
const utcDate = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const escapeText = (s: string) =>
  s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

/** Czas jako „pływający” w strefie wydarzenia — powtórzenia nie przesuwają się przy zmianie czasu. */
function wall(ms: number, tz: string): string {
  const { date, time } = localDateTime(ms, tz)
  return `${icsDate(date)}T${time.replace(':', '')}00`
}

/** EXDATE w UTC (…Z) przeliczony na czas pływający strefy wydarzenia, jak DTSTART. */
function recurrenceLine(line: string, tz: string, allDay: boolean): string | null {
  const m = /^(RRULE|EXDATE|RDATE)(;[^:]*)?:(.+)$/i.exec(line.trim())
  if (!m) return null
  const [, key = '', , value = ''] = m
  if (key.toUpperCase() === 'RRULE') return `RRULE:${value}`
  const values = value.split(',').map((v) => {
    const utc = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(v)
    if (!utc) return allDay ? v.slice(0, 8) : v
    const ms = Date.UTC(+utc[1]!, +utc[2]! - 1, +utc[3]!, +utc[4]!, +utc[5]!, +utc[6]!)
    return allDay ? icsDate(utcDate(ms)) : wall(ms, tz)
  })
  return `${key.toUpperCase()}${allDay ? ';VALUE=DATE' : ''}:${values.join(',')}`
}

/** Wydarzenia TimeTree jako plik iCalendar (do wspólnego rozwijania powtórzeń w `parseIcs`). */
export function timetreeToIcs(events: TimeTreeEvent[], timeZone = 'Europe/Warsaw'): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//planer//timetree//PL']
  for (const ev of events) {
    if (ev.deactivated_at || ev.category === 2) continue
    if (typeof ev.start_at !== 'number') continue
    const uid = ev.parent_id || ev.uuid || ev.id
    if (!uid) continue
    const tz = ev.start_timezone || timeZone
    const allDay = Boolean(ev.all_day)
    const end = typeof ev.end_at === 'number' && ev.end_at >= ev.start_at ? ev.end_at : ev.start_at
    lines.push('BEGIN:VEVENT', `UID:${uid}`, `SUMMARY:${escapeText(ev.title ?? '')}`)
    if (allDay) {
      // Całodniowe: północ UTC, koniec to ostatni dzień włącznie.
      const s = utcDate(ev.start_at)
      lines.push(`DTSTART;VALUE=DATE:${icsDate(s)}`)
      lines.push(`DTEND;VALUE=DATE:${icsDate(addDays(utcDate(end), 1))}`)
    } else {
      lines.push(`DTSTART:${wall(ev.start_at, tz)}`, `DTEND:${wall(end, ev.end_timezone || tz)}`)
    }
    if (ev.parent_id && typeof ev.recurrence_id === 'number') {
      lines.push(
        allDay
          ? `RECURRENCE-ID;VALUE=DATE:${icsDate(utcDate(ev.recurrence_id))}`
          : `RECURRENCE-ID:${wall(ev.recurrence_id, tz)}`,
      )
    } else {
      for (const r of ev.recurrences ?? []) {
        const line = recurrenceLine(r, tz, allDay)
        if (line) lines.push(line)
      }
    }
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}

export function timetreeOccurrences(
  events: TimeTreeEvent[],
  window: IcsWindow,
  timeZone = 'Europe/Warsaw',
): { events: EventOccurrence[]; truncated: boolean } {
  const { events: list, truncated } = parseIcs(timetreeToIcs(events, timeZone), window, timeZone)
  return { events: list, truncated }
}

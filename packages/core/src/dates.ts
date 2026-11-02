// Daty kart to napisy 'YYYY-MM-DD' bez strefy; liczymy na UTC, żeby uniknąć przesunięć o dobę.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const ISO_TIME = /^([01]\d|2[0-3]):[0-5]\d$/

export function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && ISO_DATE.test(value) && !Number.isNaN(Date.parse(value))
}

export function isIsoTime(value: unknown): value is string {
  return typeof value === 'string' && ISO_TIME.test(value)
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}

/** Kolejne dni od `from` do `to` włącznie (pusta lista, gdy `to` < `from`). */
export function dateRange(from: string, to: string): string[] {
  const n = daysBetween(from, to)
  return Array.from({ length: Math.max(0, n + 1) }, (_, i) => addDays(from, i))
}

/** Dzisiejsza data w lokalnej strefie urządzenia. */
export function todayLocal(now = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const weekday = new Intl.DateTimeFormat('pl-PL', { weekday: 'short', timeZone: 'UTC' })
const dayMonth = new Intl.DateTimeFormat('pl-PL', {
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
})
const dayMonthShort = new Intl.DateTimeFormat('pl-PL', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})

/** 'pon., 14 lipca' */
export function formatDayHeader(date: string): string {
  const d = new Date(`${date}T00:00:00Z`)
  return `${weekday.format(d)}, ${dayMonth.format(d)}`
}

/** '14 lip' */
export function formatShortDate(date: string): string {
  return dayMonthShort.format(new Date(`${date}T00:00:00Z`))
}

/** '14–21 lipca 2027' / '28 lip – 3 sie 2027' */
export function formatDateSpan(start?: string | null, end?: string | null): string {
  if (!start) return 'bez dat'
  const full = new Intl.DateTimeFormat('pl-PL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
  const s = new Date(`${start}T00:00:00Z`)
  if (!end || end === start) return full.format(s)
  const e = new Date(`${end}T00:00:00Z`)
  if (s.getUTCFullYear() === e.getUTCFullYear() && s.getUTCMonth() === e.getUTCMonth()) {
    return `${s.getUTCDate()}–${full.format(e)}`
  }
  return `${formatShortDate(start)} – ${full.format(e)}`
}

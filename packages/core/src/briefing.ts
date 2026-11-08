import type { AttachmentMeta } from './attachments'
import { CARD_STATUS_LABELS, type CardSnapshot } from './cards'
import { formatDayHeader } from './dates'

// Wieczorne podsumowanie na jutro (push z workera). Składanie treści bez sieci i bazy — testowalne.

export type BriefingSettings = { enabled: boolean; time: string }
export const DEFAULT_BRIEFING: BriefingSettings = { enabled: true, time: '21:00' }

export type DayForecast = { max: number; min: number; rain: number; rainHours: string[] }

export type Briefing = { title: string; body: string }

/** Godziny deszczu jako przedziały: ['14','15','16','19'] → „14–17, 19–20”. */
export function rainSpans(hours: string[]): string {
  const nums = [...new Set(hours.map(Number))].sort((a, b) => a - b)
  const spans: [number, number][] = []
  for (const h of nums) {
    const last = spans.at(-1)
    if (last && h === last[1]) last[1] = h + 1
    else spans.push([h, h + 1])
  }
  return spans.map(([a, b]) => `${a}–${b}`).join(', ')
}

/**
 * Treść pusha: pierwsza karta (z godziną wyjścia, gdy jest dojazd), liczba kart, bilety, rzeczy do
 * rezerwacji i pogoda z deszczem. Bez kart na jutro — null (nie ma o czym przypominać).
 */
export function composeBriefing(input: {
  date: string
  cards: CardSnapshot[]
  attachments: AttachmentMeta[]
  leaveBy?: string
  forecast?: DayForecast
}): Briefing | null {
  const day = input.cards
    .filter((c) => c.date === input.date && !c.deletedAt && !c.variantOf && !c.skipped)
    .sort((a, b) => (a.time ?? '99').localeCompare(b.time ?? '99'))
  if (!day.length) return null
  const first = day.find((c) => c.time) ?? day[0]
  const withFiles = new Set(input.attachments.map((a) => a.cardId))
  const tickets = day.filter((c) => withFiles.has(c.id)).length
  const missing = day.filter((c) => c.status === 'missing')
  const f = input.forecast
  const lines = [
    first &&
      `${first.time ? `${first.time} ` : ''}${first.title || 'bez tytułu'}${input.leaveBy ? ` · wyjdź o ${input.leaveBy}` : ''}`,
    day.length > 1 && `w planie ${day.length} ${day.length < 5 ? 'karty' : 'kart'}`,
    tickets > 0 && `bilety w ${tickets === 1 ? '1 karcie' : `${tickets} kartach`}`,
    missing.length > 0 &&
      `${CARD_STATUS_LABELS.missing}: ${missing.map((c) => c.title || 'bez tytułu').join(', ')}`,
    f &&
      `${Math.round(f.max)}°/${Math.round(f.min)}°${f.rainHours.length ? ` · deszcz ${rainSpans(f.rainHours)}` : f.rain >= 50 ? ` · deszcz ${f.rain}%` : ''}`,
  ].filter(Boolean) as string[]
  return { title: `jutro · ${formatDayHeader(input.date)}`, body: lines.join('\n') }
}

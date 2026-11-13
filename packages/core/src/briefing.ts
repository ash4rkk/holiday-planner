import type { AttachmentMeta } from './attachments'
import { CARD_STATUS_LABELS, type CardSnapshot, spanMin } from './cards'
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

// ---------- deszcz w godzinach kart (plan B) ----------

export const RAIN_PROBABILITY = 50
export const RAIN_MM = 0.2

/** Godzina deszczowa: prawdopodobny opad albo realny opad w prognozie. */
export function isWetHour(probability: number, mm: number): boolean {
  return probability >= RAIN_PROBABILITY || mm >= RAIN_MM
}

const minutesOf = (time: string) => {
  const [h = 0, m = 0] = time.split(':').map(Number)
  return h * 60 + m
}

/** Burza w kodach WMO (Open-Meteo): 95 burza, 96 i 99 burza z gradem. */
export const isStormCode = (code: number) => code >= 95 && code <= 99

export type Sky = 'rain' | 'storm'
export type SkyHour = { hour: number; wet: boolean; storm: boolean }

/**
 * Niebo nad kartami dnia: deszcz albo burza w godzinach, które karta obejmuje (bez czasu trwania —
 * godzina). Burza wygrywa z deszczem. Do animacji tła karty; pominięte i warianty bez nieba.
 */
export function cardSkies(cards: CardSnapshot[], date: string, hours: SkyHour[]): Map<string, Sky> {
  const out = new Map<string, Sky>()
  const byHour = new Map(hours.map((h) => [h.hour, h]))
  if (!hours.some((h) => h.wet || h.storm)) return out
  for (const c of cards) {
    if (c.date !== date || !c.time || c.deletedAt || c.variantOf || c.skipped) continue
    const start = minutesOf(c.time)
    const end = start + (spanMin(c) ?? 60)
    let sky: Sky | undefined
    for (let h = Math.floor(start / 60); h * 60 < end; h++) {
      const at = byHour.get(h)
      if (at?.storm) sky = 'storm'
      else if (at?.wet && !sky) sky = 'rain'
    }
    if (sky) out.set(c.id, sky)
  }
  return out
}

/**
 * Karty dnia, których czas trwania (domyślnie godzina) zahacza o godziny deszczu. Które są pod
 * gołym niebem, ocenia dopiero AI na życzenie — tu tylko „czy w ogóle jest o co pytać”.
 */
export function cardsInRain(
  cards: CardSnapshot[],
  date: string,
  rainHours: string[],
): CardSnapshot[] {
  const wet = new Set(rainHours.map(Number))
  if (!wet.size) return []
  return cards.filter((c) => {
    if (c.date !== date || !c.time || c.deletedAt || c.variantOf || c.skipped) return false
    const start = minutesOf(c.time)
    const end = start + (spanMin(c) ?? 60)
    for (let h = Math.floor(start / 60); h * 60 < end; h++) if (wet.has(h)) return true
    return false
  })
}

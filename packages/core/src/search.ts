import type * as Y from 'yjs'
import { formatAmount } from './amounts'
import { attachmentsOf } from './attachments'
import type { CardSnapshot } from './cards'
import { cardsOf, contentOf, fragmentLines, readCards } from './trip-doc'

// Wyszukiwarka kart wyjazdu: działa na dokumencie Yjs (także offline), bez ogonków i wielkości liter.

export type SearchField = 'tytuł' | 'miejsce' | 'treść' | 'plik' | 'kwota'

export type SearchHit = {
  card: CardSnapshot
  field: SearchField
  /** Fragment do pokazania i zakresy dopasowań w nim (do wyróżnienia). */
  snippet: string
  ranges: [number, number][]
  score: number
}

const WEIGHT: Record<SearchField, number> = { tytuł: 4, miejsce: 3, plik: 2, kwota: 2, treść: 1 }
const SNIPPET_AROUND = 36
const MAX_HITS = 50

/** Znak bez ogonków, małą literą; „ł” NFD nie rozkłada, więc osobno. */
function foldChar(ch: string): string {
  const lower = ch.toLowerCase()
  if (lower === 'ł') return 'l'
  return lower.normalize('NFD').replace(/\p{M}/gu, '') || lower
}

/** Tekst złożony do porównań i mapa: pozycja w złożonym → pozycja w oryginale. */
function fold(text: string): { folded: string; at: number[] } {
  let folded = ''
  const at: number[] = []
  for (let i = 0; i < text.length; i++) {
    const f = foldChar(text[i] as string)
    for (let k = 0; k < f.length; k++) at.push(i)
    folded += f
  }
  at.push(text.length)
  return { folded, at }
}

export function searchTokens(query: string): string[] {
  return fold(query).folded.split(/\s+/).filter(Boolean)
}

/** Zakresy (w oryginalnym tekście) wszystkich wystąpień słów zapytania. */
function matches(
  text: string,
  tokens: string[],
): { ranges: [number, number][]; found: Set<string> } {
  const { folded, at } = fold(text)
  const ranges: [number, number][] = []
  const found = new Set<string>()
  for (const token of tokens) {
    let from = folded.indexOf(token)
    while (from !== -1) {
      found.add(token)
      ranges.push([at[from] as number, at[from + token.length] as number])
      from = folded.indexOf(token, from + token.length)
    }
  }
  ranges.sort((a, b) => a[0] - b[0])
  // Nakładające się zakresy (np. „rzym” i „rzymu”) łączymy w jeden.
  const merged: [number, number][] = []
  for (const r of ranges) {
    const last = merged.at(-1)
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1])
    else merged.push([r[0], r[1]])
  }
  return { ranges: merged, found }
}

/** Długi tekst przycinany wokół pierwszego dopasowania, z przesunięciem zakresów. */
function clip(
  text: string,
  ranges: [number, number][],
): { snippet: string; ranges: [number, number][] } {
  const first = ranges[0]
  if (!first || text.length <= SNIPPET_AROUND * 2 + 20) return { snippet: text, ranges }
  const start = Math.max(0, first[0] - SNIPPET_AROUND)
  const end = Math.min(text.length, first[1] + SNIPPET_AROUND * 2)
  const prefix = start > 0 ? '…' : ''
  const shift = prefix.length - start
  return {
    snippet: `${prefix}${text.slice(start, end)}${end < text.length ? '…' : ''}`,
    ranges: ranges
      .filter(([a, b]) => a >= start && b <= end)
      .map(([a, b]) => [a + shift, b + shift] as [number, number]),
  }
}

/**
 * Karty pasujące do zapytania: każde słowo musi wystąpić w którymś polu karty (tytuł, miejsce,
 * treść, nazwy plików, kwoty). Wyżej tytuł i miejsce, karty z kosza na końcu.
 */
export function searchCards(doc: Y.Doc, query: string): SearchHit[] {
  const tokens = searchTokens(query)
  if (!tokens.length) return []
  const files = new Map<string, string[]>()
  for (const meta of attachmentsOf(doc).values()) {
    const cardId = meta.get('cardId') as string | undefined
    const name = meta.get('name') as string | undefined
    if (cardId && name) files.set(cardId, [...(files.get(cardId) ?? []), name])
  }
  const maps = cardsOf(doc)
  const hits: SearchHit[] = []
  for (const card of readCards(doc)) {
    const map = maps.get(card.id)
    const body = map ? fragmentLines(contentOf(map)).slice(1).join(' · ') : card.preview
    const fields: [SearchField, string][] = [
      ['tytuł', card.title],
      ['miejsce', [card.location?.name, card.location?.address].filter(Boolean).join(' · ')],
      ['miejsce', [card.destination?.name, card.destination?.address].filter(Boolean).join(' · ')],
      ['treść', body],
      ...(files.get(card.id) ?? []).map((name): [SearchField, string] => ['plik', name]),
      ['kwota', (card.amounts ?? []).map(formatAmount).join(' · ')],
    ]
    const found = new Set<string>()
    let best: {
      field: SearchField
      text: string
      ranges: [number, number][]
      count: number
    } | null = null
    let score = 0
    for (const [field, text] of fields) {
      if (!text) continue
      const m = matches(text, tokens)
      if (!m.found.size) continue
      for (const t of m.found) found.add(t)
      score += m.found.size * WEIGHT[field]
      const better =
        !best ||
        m.found.size > best.count ||
        (m.found.size === best.count && WEIGHT[field] > WEIGHT[best.field])
      if (better) best = { field, text, ranges: m.ranges, count: m.found.size }
    }
    if (!best || found.size < tokens.length) continue
    // Tytuł zaczynający się od zapytania to zwykle szukana karta.
    if (fold(card.title).folded.startsWith(tokens[0] as string)) score += 3
    if (card.deletedAt) score -= 100
    const { snippet, ranges } =
      best.field === 'treść'
        ? clip(best.text, best.ranges)
        : { snippet: best.text, ranges: best.ranges }
    hits.push({ card, field: best.field, snippet, ranges, score })
  }
  return hits
    .sort(
      (a, b) =>
        b.score - a.score ||
        (a.card.date ?? '9999').localeCompare(b.card.date ?? '9999') ||
        (a.card.time ?? '').localeCompare(b.card.time ?? ''),
    )
    .slice(0, MAX_HITS)
}

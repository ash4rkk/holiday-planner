import type * as Y from 'yjs'
import { withoutAmounts } from './amounts'
import {
  CARD_TYPES,
  type CardLocation,
  type CardSnapshot,
  type CardStatus,
  type CardType,
  type EditableCardFields,
} from './cards'
import { isIsoDate, isIsoTime } from './dates'
import { appendCardText, updateCard } from './trip-doc'

// Karty proponowane przez AI w czacie. Model nic nie zmienia sam: propozycja trafia do okienka
// czatu, a kartę tworzy dopiero zatwierdzenie w przeglądarce.

export type CardProposal = {
  type: CardType
  title: string
  date?: string
  time?: string
  durationMin?: number
  place?: string
  /** Pełny adres (ulica, miasto) — trafia do pola adresu karty i do geokodowania. */
  address?: string
  location?: CardLocation
  amount?: { value: number; currency: string }
  /** 1–2 zdania o miejscu: czym jest i dlaczego warto. */
  description?: string
  /** Praktyczne uwagi (wejście, kolejki, ubiór) — osobno od opisu. */
  notes?: string
  /** Oficjalna strona kupna biletów lub rezerwacji. */
  ticketsUrl?: string
  /** Trzeba kupić bilet albo zarezerwować — karta dostaje status „do rezerwacji”. */
  booking?: boolean
  /** Zamiennik istniejącej karty (np. plan B na deszcz) — dodawany jako jej wariant. */
  variantOf?: string
}

/** Tylko adresy http(s); inne (javascript:, data:) odrzucamy. */
export function safeUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  try {
    const url = new URL(value.trim())
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined
  } catch {
    return undefined
  }
}

const text = (value: unknown, max: number) =>
  typeof value === 'string' ? withoutAmounts(value).trim().slice(0, max) : ''

const MAX_PROPOSALS = 8

/**
 * Model trzyma się schematu, ale format pól sprawdzamy sami — zły format = puste pole. Składnia kwot
 * w tekście weszłaby do sum, więc kwota jest tylko w polu `amount`. Data spoza wyjazdu to pomysł bez
 * terminu, a nie karta w dniu, którego nie ma w planie.
 */
export function normalizeProposals(
  input: unknown,
  trip: { startDate?: string | null; endDate?: string | null } = {},
): CardProposal[] {
  const raw = (input as { cards?: unknown } | null)?.cards
  if (!Array.isArray(raw)) return []
  return raw.slice(0, MAX_PROPOSALS).flatMap((item): CardProposal[] => {
    const c = (item ?? {}) as Record<string, unknown>
    const title = typeof c.title === 'string' ? withoutAmounts(c.title).slice(0, 120) : ''
    if (!title) return []
    const type = CARD_TYPES.find((t) => t === c.type) ?? 'note'
    const duration = Number(c.duration_min)
    const value = Number(c.amount)
    const currency = typeof c.currency === 'string' ? c.currency.trim().toUpperCase() : 'PLN'
    const place = typeof c.place === 'string' ? c.place.trim().slice(0, 200) : ''
    const address = typeof c.address === 'string' ? c.address.trim().slice(0, 300) : ''
    const description = text(c.description, 500)
    const notes = text(c.notes, 1000)
    const ticketsUrl = safeUrl(c.tickets_url)
    const dated = isIsoDate(c.date) && inTrip(c.date, trip)
    return [
      {
        type,
        title,
        ...(dated && { date: c.date as string }),
        ...(dated && isIsoTime(c.time) && { time: c.time }),
        ...(duration > 0 && duration <= 1440 && { durationMin: Math.round(duration) }),
        ...(place && { place }),
        ...(value > 0 &&
          /^[A-Z]{3}$/.test(currency) && {
            amount: { value: Math.round(value * 100) / 100, currency },
          }),
        ...(address && { address }),
        ...(description && { description }),
        ...(notes && { notes }),
        ...(ticketsUrl && { ticketsUrl }),
        ...(c.needs_booking === true && { booking: true }),
        ...(typeof c.variant_of === 'string' &&
          /^[\w-]{4,40}$/.test(c.variant_of) && { variantOf: c.variant_of }),
      },
    ]
  })
}

function inTrip(date: string, trip: { startDate?: string | null; endDate?: string | null }) {
  if (!trip.startDate) return true
  return date >= trip.startDate && date <= (trip.endDate ?? trip.startDate)
}

const plain = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()

/** Istniejąca karta z tym samym tytułem albo miejscem; wielkość liter i ogonki się nie liczą. */
export function matchingCard(p: CardProposal, cards: CardSnapshot[]): CardSnapshot | undefined {
  const title = plain(p.title)
  const place = plain(p.location?.name ?? p.place ?? '')
  return cards.find(
    (c) =>
      !c.deletedAt &&
      (plain(c.title) === title || (place !== '' && plain(c.location?.name ?? '') === place)),
  )
}

/**
 * Treść karty: tytuł, opis miejsca, osobno praktyczne uwagi, link do biletów i kwota w składni /+.
 */
export function proposalText(p: CardProposal): string {
  const amount =
    p.amount &&
    `/+${String(p.amount.value).replace('.', ',')}${p.amount.currency === 'PLN' ? '' : ` ${p.amount.currency}`}`
  return [
    p.title,
    p.description,
    p.notes && `uwagi: ${p.notes}`,
    p.ticketsUrl && `bilety: ${p.ticketsUrl}`,
    amount,
  ]
    .filter(Boolean)
    .join('\n')
}

/** Decyzja przy propozycji karty (`idea`, `plan`, `skipped`) albo zmianie (`applied`, `skipped`). */
export type ProposalDecision = 'idea' | 'plan' | 'applied' | 'skipped'
export const PROPOSAL_DECISIONS: readonly ProposalDecision[] = [
  'idea',
  'plan',
  'applied',
  'skipped',
]

/**
 * Krótki opis tego, co odpowiedź zaproponowała — dopisywany do historii dla modelu, żeby przy
 * następnym pytaniu wiedział, o których kartach mowa („dodaj tę drugą”).
 */
export function proposalsSummary(cards: CardProposal[], changes: CardChange[]): string {
  const lines = [
    ...cards.map(
      (c, i) =>
        `${i + 1}. ${c.title}${c.date ? ` (${c.date}${c.time ? ` ${c.time}` : ''})` : ''}${c.place ? ` · ${c.place}` : ''}`,
    ),
    ...changes.map((c) => `zmiana karty ${c.cardId}: ${c.reason ?? ''}`.trim()),
  ]
  return lines.length ? `[pokazane propozycje — czekają na decyzję osoby]\n${lines.join('\n')}` : ''
}

// ---------- zmiany istniejących kart (też tylko po zatwierdzeniu) ----------

export type CardChange = {
  cardId: string
  /** Krótko, dlaczego ta zmiana. */
  reason?: string
  date?: string
  time?: string
  durationMin?: number
  /** null = usuń status. */
  status?: CardStatus | null
  place?: string
  address?: string
  location?: CardLocation
  /** Dopisek na końcu treści karty (np. link do biletów). */
  appendText?: string
}

const MAX_CHANGES = 8
const STATUS_INPUT: Record<string, CardStatus | null> = {
  missing: 'missing',
  booked: 'booked',
  none: null,
}

/** Zmiany tylko dla istniejących, niewyrzuconych kart; zmiana bez żadnego pola odpada. */
export function normalizeChanges(
  input: unknown,
  cards: CardSnapshot[],
  trip: { startDate?: string | null; endDate?: string | null } = {},
): CardChange[] {
  const raw = (input as { changes?: unknown } | null)?.changes
  if (!Array.isArray(raw)) return []
  const live = new Set(cards.filter((c) => !c.deletedAt).map((c) => c.id))
  return raw.slice(0, MAX_CHANGES).flatMap((item): CardChange[] => {
    const c = (item ?? {}) as Record<string, unknown>
    const cardId = typeof c.card_id === 'string' ? c.card_id.replace(/^card:/, '') : ''
    if (!live.has(cardId)) return []
    const duration = Number(c.duration_min)
    const status = typeof c.status === 'string' ? STATUS_INPUT[c.status] : undefined
    const place = typeof c.place === 'string' ? c.place.trim().slice(0, 200) : ''
    const address = typeof c.address === 'string' ? c.address.trim().slice(0, 300) : ''
    const appendText = text(c.append_text, 1000)
    const change: CardChange = {
      cardId,
      ...(typeof c.reason === 'string' &&
        c.reason.trim() && { reason: c.reason.trim().slice(0, 300) }),
      ...(isIsoDate(c.date) && inTrip(c.date, trip) && { date: c.date }),
      ...(isIsoTime(c.time) && { time: c.time }),
      ...(duration > 0 && duration <= 1440 && { durationMin: Math.round(duration) }),
      ...(status !== undefined && { status }),
      ...(place && { place }),
      ...(address && { address }),
      ...(appendText && { appendText }),
    }
    const fields = Object.keys(change).filter((k) => k !== 'cardId' && k !== 'reason')
    return fields.length ? [change] : []
  })
}

/** Stosuje zatwierdzoną zmianę do dokumentu (w przeglądarce, po „zastosuj”). */
export function applyCardChange(doc: Y.Doc, change: CardChange) {
  const patch: Partial<EditableCardFields> = {}
  if (change.date) patch.date = change.date
  if (change.time) patch.time = change.time
  if (change.durationMin) patch.durationMin = change.durationMin
  if (change.status !== undefined) patch.status = change.status ?? undefined
  if (change.location) patch.location = change.location
  doc.transact(() => {
    if (Object.keys(patch).length) updateCard(doc, change.cardId, patch)
    if (change.appendText) appendCardText(doc, change.cardId, change.appendText)
  })
}

import { withoutAmounts } from './amounts'
import { CARD_TYPES, type CardLocation, type CardSnapshot, type CardType } from './cards'
import { isIsoDate, isIsoTime } from './dates'

// Karty proponowane przez AI w czacie. Model nic nie zmienia sam: propozycja trafia do okienka
// czatu, a kartę tworzy dopiero zatwierdzenie w przeglądarce.

export type CardProposal = {
  type: CardType
  title: string
  date?: string
  time?: string
  durationMin?: number
  place?: string
  location?: CardLocation
  amount?: { value: number; currency: string }
  notes?: string
}

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
    const notes = typeof c.notes === 'string' ? withoutAmounts(c.notes).slice(0, 1000) : ''
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
        ...(notes && { notes }),
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

/** Treść karty: tytuł, uwagi i kwota w składni /+. */
export function proposalText(p: CardProposal): string {
  const amount =
    p.amount &&
    `/+${String(p.amount.value).replace('.', ',')}${p.amount.currency === 'PLN' ? '' : ` ${p.amount.currency}`}`
  return [p.title, p.notes, amount].filter(Boolean).join('\n')
}

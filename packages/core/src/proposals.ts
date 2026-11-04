import { CARD_TYPES, type CardLocation, type CardType } from './cards'
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

/** Model trzyma się schematu, ale format pól sprawdzamy sami — zły format = puste pole. */
export function normalizeProposals(input: unknown): CardProposal[] {
  const raw = (input as { cards?: unknown } | null)?.cards
  if (!Array.isArray(raw)) return []
  return raw.slice(0, MAX_PROPOSALS).flatMap((item): CardProposal[] => {
    const c = (item ?? {}) as Record<string, unknown>
    const title = typeof c.title === 'string' ? c.title.trim().slice(0, 120) : ''
    if (!title) return []
    const type = CARD_TYPES.find((t) => t === c.type) ?? 'note'
    const duration = Number(c.duration_min)
    const value = Number(c.amount)
    const currency = typeof c.currency === 'string' ? c.currency.trim().toUpperCase() : 'PLN'
    const place = typeof c.place === 'string' ? c.place.trim().slice(0, 200) : ''
    const notes = typeof c.notes === 'string' ? c.notes.trim().slice(0, 1000) : ''
    return [
      {
        type,
        title,
        ...(isIsoDate(c.date) && { date: c.date }),
        ...(isIsoTime(c.time) && { time: c.time }),
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

/** Treść karty: tytuł, uwagi i kwota w składni /+. */
export function proposalText(p: CardProposal): string {
  const amount =
    p.amount &&
    `/+${String(p.amount.value).replace('.', ',')}${p.amount.currency === 'PLN' ? '' : ` ${p.amount.currency}`}`
  return [p.title, p.notes, amount].filter(Boolean).join('\n')
}

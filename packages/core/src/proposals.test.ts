import { describe, expect, it } from 'vitest'
import { normalizeProposals, proposalText } from './proposals'

describe('normalizeProposals', () => {
  it('przepuszcza poprawne pola', () => {
    const [card] = normalizeProposals({
      cards: [
        {
          type: 'food',
          title: ' Kolacja ',
          date: '2027-07-14',
          time: '19:30',
          duration_min: 90,
          place: 'Time Out Market',
          amount: 40.5,
          currency: 'eur',
          notes: 'rezerwacja',
        },
      ],
    })
    expect(card).toEqual({
      type: 'food',
      title: 'Kolacja',
      date: '2027-07-14',
      time: '19:30',
      durationMin: 90,
      place: 'Time Out Market',
      amount: { value: 40.5, currency: 'EUR' },
      notes: 'rezerwacja',
    })
  })

  it('zły format = puste pole, nieznany typ = notatka, bez tytułu = bez karty', () => {
    const cards = normalizeProposals({
      cards: [
        { type: 'hack', title: 'A', date: 'jutro', time: '25:00', amount: -1, currency: 'euro' },
        { title: '   ' },
        null,
      ],
    })
    expect(cards).toEqual([{ type: 'note', title: 'A' }])
  })

  it('zły kształt wejścia i limit kart', () => {
    expect(normalizeProposals('x')).toEqual([])
    expect(normalizeProposals(null)).toEqual([])
    const many = Array.from({ length: 20 }, () => ({ title: 'x' }))
    expect(normalizeProposals({ cards: many })).toHaveLength(8)
  })
})

describe('proposalText', () => {
  it('kwota w składni /+, złote bez waluty', () => {
    expect(
      proposalText({
        type: 'sight',
        title: 'Zamek',
        notes: 'bilety online',
        amount: { value: 15.5, currency: 'EUR' },
      }),
    ).toBe('Zamek\nbilety online\n/+15,5 EUR')
    expect(
      proposalText({ type: 'food', title: 'Obiad', amount: { value: 60, currency: 'PLN' } }),
    ).toBe('Obiad\n/+60')
  })
})

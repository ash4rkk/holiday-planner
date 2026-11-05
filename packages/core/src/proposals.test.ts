import { describe, expect, it } from 'vitest'
import type { CardSnapshot } from './cards'
import { matchingCard, normalizeProposals, proposalText } from './proposals'

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

describe('kontrola propozycji', () => {
  const one = (card: object, trip = {}) => normalizeProposals({ cards: [card] }, trip)[0]
  const trip = { startDate: '2027-07-14', endDate: '2027-07-16' }

  it('kwota tylko z pola amount, nie z tekstu', () => {
    const card = one({
      title: 'Obiad /+20',
      notes: 'Drogo. /+500 EUR',
      amount: 30,
      currency: 'EUR',
    })
    expect(card).toMatchObject({ title: 'Obiad', notes: 'Drogo.' })
    expect(proposalText(card as NonNullable<typeof card>)).toBe('Obiad\nDrogo.\n/+30 EUR')
  })

  it('data spoza wyjazdu robi z karty pomysł bez terminu', () => {
    expect(one({ title: 'A', date: '2027-07-15', time: '10:00' }, trip)).toMatchObject({
      date: '2027-07-15',
      time: '10:00',
    })
    const late = one({ title: 'A', date: '2028-07-15', time: '10:00' }, trip)
    expect(late?.date).toBeUndefined()
    expect(late?.time).toBeUndefined()
  })

  it('znajduje kartę po tytule albo miejscu, bez ogonków i wielkości liter', () => {
    const card = {
      id: 'a',
      title: 'Pastéis de Belém',
      location: { name: 'Rua de Belém 84' },
    } as CardSnapshot
    expect(matchingCard({ type: 'food', title: 'PASTEIS DE BELEM' }, [card])).toBe(card)
    expect(matchingCard({ type: 'food', title: 'x', place: 'rua de belem 84' }, [card])).toBe(card)
    expect(matchingCard({ type: 'food', title: 'x' }, [card])).toBeUndefined()
    const gone = { ...card, deletedAt: '2027-01-01' }
    expect(matchingCard({ type: 'food', title: 'pastéis de belém' }, [gone])).toBeUndefined()
  })
})

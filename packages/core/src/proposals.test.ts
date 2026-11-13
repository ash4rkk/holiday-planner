import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import type { CardSnapshot } from './cards'
import {
  applyCardChange,
  type CardChange,
  type CardProposal,
  matchingCard,
  normalizeChanges,
  normalizeProposals,
  proposalsSummary,
  proposalText,
} from './proposals'
import { createCard, readCards } from './trip-doc'

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
    ).toBe('Zamek\nuwagi: bilety online\n/+15,5 EUR')
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
    expect(proposalText(card as NonNullable<typeof card>)).toBe('Obiad\nuwagi: Drogo.\n/+30 EUR')
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

describe('propozycje: adres, opis, uwagi, bilety', () => {
  it('osobne pola i treść karty z uwagami i linkiem', () => {
    const [p] = normalizeProposals({
      cards: [
        {
          type: 'sight',
          title: 'Torre de Belém',
          place: 'Torre de Belém, Lizbona',
          address: 'Av. Brasília, 1400-038 Lisboa',
          description: 'Wieża obronna z XVI wieku nad Tagiem.',
          notes: 'kolejka rano krótsza',
          tickets_url: 'https://www.museusemonumentos.pt/bilhetes',
          needs_booking: true,
        },
      ],
    })
    expect(p?.address).toBe('Av. Brasília, 1400-038 Lisboa')
    expect(p?.booking).toBe(true)
    expect(proposalText(p as CardProposal).split('\n')).toEqual([
      'Torre de Belém',
      'Wieża obronna z XVI wieku nad Tagiem.',
      'uwagi: kolejka rano krótsza',
      'bilety: https://www.museusemonumentos.pt/bilhetes',
    ])
  })

  it('link tylko http(s)', () => {
    const [p] = normalizeProposals({
      cards: [{ type: 'sight', title: 'x', tickets_url: 'javascript:alert(1)' }],
    })
    expect(p?.ticketsUrl).toBeUndefined()
  })
})

describe('zmiany kart od AI', () => {
  it('tylko istniejące karty i pola w poprawnym formacie; zastosowanie zmienia kartę', () => {
    const doc = new Y.Doc()
    const id = createCard(
      doc,
      { type: 'sight', date: '2027-07-14', time: '10:00' },
      new Date(),
      'Pena',
    )
    const changes = normalizeChanges(
      {
        changes: [
          {
            card_id: `card:${id}`,
            time: '09:30',
            status: 'missing',
            append_text: 'bilety: https://x.pt',
            reason: 'mniej ludzi',
          },
          { card_id: 'nie-ma', time: '11:00' },
          { card_id: id, time: '25:99' },
        ],
      },
      readCards(doc),
    )
    expect(changes).toHaveLength(1)
    applyCardChange(doc, changes[0] as CardChange)
    const card = readCards(doc)[0]
    expect(card?.time).toBe('09:30')
    expect(card?.status).toBe('missing')
    expect(card?.preview).toContain('bilety: https://x.pt')
  })
})

describe('proposalsSummary', () => {
  it('numerowane propozycje i zmiany dla historii modelu; pusto, gdy nic nie było', () => {
    const text = proposalsSummary(
      [
        { type: 'sight', title: 'Koloseum', date: '2027-07-15', time: '09:00', place: 'Rzym' },
        { type: 'food', title: 'Da Enzo' },
      ] as CardProposal[],
      [{ cardId: 'abc', reason: 'wcześniej mniej ludzi' }] as CardChange[],
    )
    expect(text).toContain('1. Koloseum (2027-07-15 09:00) · Rzym')
    expect(text).toContain('2. Da Enzo')
    expect(text).toContain('zmiana karty abc: wcześniej mniej ludzi')
    expect(proposalsSummary([], [])).toBe('')
  })
})

describe('normalizeProposals: transport', () => {
  it('przyjazd i cel tylko dla transportu z godziną w wyjeździe', () => {
    const trip = { startDate: '2026-12-26', endDate: '2027-01-02' }
    const base = {
      title: 'Pociąg',
      date: '2026-12-26',
      time: '08:54',
      end_time: '19:49',
      destination: 'Budapest Nyugati, Budapeszt',
    }
    const [train, sight] = normalizeProposals(
      {
        cards: [
          { ...base, type: 'transport' },
          { ...base, type: 'sight' },
        ],
      },
      trip,
    )
    expect(train).toMatchObject({
      endTime: '19:49',
      destinationName: 'Budapest Nyugati, Budapeszt',
    })
    expect(sight?.endTime).toBeUndefined()
    expect(sight?.destinationName).toBeUndefined()
    const [bad] = normalizeProposals(
      { cards: [{ ...base, type: 'transport', end_time: '7pm' }] },
      trip,
    )
    expect(bad?.endTime).toBeUndefined()
  })
})

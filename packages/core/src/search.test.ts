import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { attachmentsOf } from './attachments'
import { searchCards, searchTokens } from './search'
import { createCard, trashCard, updateCard } from './trip-doc'

function trip() {
  const doc = new Y.Doc()
  const colosseum = createCard(
    doc,
    { type: 'sight', date: '2027-07-15', time: '09:00' },
    new Date(),
    'Koloseum\nwejście od Via Sacra, bilety na 9:00',
  )
  const pizza = createCard(
    doc,
    { type: 'food', date: '2027-07-14' },
    new Date(),
    'Kolacja\npizza /+42 EUR',
  )
  updateCard(doc, pizza, { location: { name: 'Pizzeria Łódź', address: 'Via Roma 1, Neapol' } })
  const flight = createCard(doc, { type: 'transport' }, new Date(), 'Lot do Rzymu')
  attachmentsOf(doc).set(
    'f1',
    new Y.Map(Object.entries({ cardId: flight, name: 'karta-pokladowa-FR123.pdf' })),
  )
  return { doc, colosseum, pizza, flight }
}

describe('searchCards', () => {
  it('bez ogonków i wielkości liter, także „ł”', () => {
    const { doc, pizza } = trip()
    expect(searchTokens('  ŁÓDŹ  ')).toEqual(['lodz'])
    const [hit] = searchCards(doc, 'lodz')
    expect(hit?.card.id).toBe(pizza)
    expect(hit?.field).toBe('miejsce')
    expect(hit?.snippet.slice(...(hit.ranges[0] as [number, number]))).toBe('Łódź')
  })

  it('wszystkie słowa muszą pasować, w różnych polach', () => {
    const { doc, pizza } = trip()
    expect(searchCards(doc, 'pizza neapol').map((h) => h.card.id)).toEqual([pizza])
    expect(searchCards(doc, 'pizza rzym')).toEqual([])
  })

  it('treść, nazwy plików i kwoty; tytuł wyżej niż treść', () => {
    const { doc, colosseum, flight } = trip()
    expect(searchCards(doc, 'via sacra')[0]?.card.id).toBe(colosseum)
    expect(searchCards(doc, 'fr123')[0]).toMatchObject({ field: 'plik' })
    expect(searchCards(doc, 'fr123')[0]?.card.id).toBe(flight)
    expect(searchCards(doc, '42')[0]?.field).toBe('kwota')
    expect(searchCards(doc, 'kolo')[0]?.field).toBe('tytuł')
  })

  it('karty z kosza na końcu, puste zapytanie bez wyników', () => {
    const { doc, colosseum } = trip()
    createCard(doc, { type: 'note' }, new Date(), 'Via notatka')
    trashCard(doc, colosseum)
    const hits = searchCards(doc, 'via')
    expect(hits.at(-1)?.card.id).toBe(colosseum)
    expect(searchCards(doc, '   ')).toEqual([])
  })
})

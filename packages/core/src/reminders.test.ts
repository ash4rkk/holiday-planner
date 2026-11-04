import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { cardsDigest, changedTitles, changesBody, computeReminders } from './reminders'
import { createCard, readCards, trashCard, updateCard } from './trip-doc'

describe('computeReminders', () => {
  it('godzina lokalna miejsca wyjazdu, domyślne wyprzedzenie wg typu, własne z karty', () => {
    const doc = new Y.Doc()
    createCard(doc, {
      type: 'transport',
      date: '2027-07-14',
      time: '10:00',
      location: { name: 'Lotnisko Chopina' },
    })
    createCard(doc, { type: 'food', date: '2027-07-14', time: '20:00', remindMin: 30 })
    createCard(doc, { type: 'note', date: '2027-07-14', time: '12:00' }) // notatka: bez przypomnienia
    createCard(doc, { type: 'sight', date: '2027-07-14' }) // bez godziny
    const rows = computeReminders(readCards(doc), 'Rzym', 'Europe/Rome')
    expect(rows.map((r) => r.fireAt.toISOString())).toEqual([
      '2027-07-14T05:00:00.000Z', // 10:00 CEST − 3 h
      '2027-07-14T17:30:00.000Z', // 20:00 CEST − 30 min
    ])
    expect(rows[0]?.body).toBe('za 3 h · 10:00 · ⌖ Lotnisko Chopina · Rzym')
    expect(rows[1]?.body).toBe('za 30 min · 20:00 · Rzym')
  })

  it('strefa ma znaczenie (Lizbona = Warszawa − 1 h), także przy zmianie czasu', () => {
    const doc = new Y.Doc()
    createCard(doc, { type: 'transport', date: '2027-03-28', time: '08:00', remindMin: 90 })
    expect(computeReminders(readCards(doc), 'x', 'Europe/Lisbon')[0]?.fireAt.toISOString()).toBe(
      '2027-03-28T05:30:00.000Z',
    )
    expect(computeReminders(readCards(doc), 'x', 'Europe/Warsaw')[0]?.fireAt.toISOString()).toBe(
      '2027-03-28T04:30:00.000Z',
    )
    expect(computeReminders(readCards(doc), 'x', 'Nie/Istnieje')).toEqual([])
  })
})

describe('zmiany drugiej osoby', () => {
  it('nowe, zmienione i usunięte karty', () => {
    const doc = new Y.Doc()
    const a = createCard(doc, { type: 'sight' }, new Date(), 'Koloseum')
    const b = createCard(doc, { type: 'food' }, new Date(), 'Pizzeria')
    createCard(doc, { type: 'note' }, new Date(), 'Bez zmian')
    const before = cardsDigest(readCards(doc))
    updateCard(doc, a, { time: '10:00' })
    trashCard(doc, b)
    createCard(doc, { type: 'sight' }, new Date(), 'Forum')
    const cards = readCards(doc)
    const titles = changedTitles(before, cardsDigest(cards), cards)
    expect(titles.sort()).toEqual(['Forum', 'Koloseum', 'Pizzeria'])
    expect(changesBody(['a', 'b', 'c', 'd', 'e'])).toBe('a, b i 3 inne')
  })
})

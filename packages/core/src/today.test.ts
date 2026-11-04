import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { nextPlace } from './today'
import { createCard, readCards } from './trip-doc'

describe('nextPlace', () => {
  it('najbliższe z godziną, 15 min zapasu, bez zaliczonych i noclegów; potem bez godziny', () => {
    const doc = new Y.Doc()
    const at = { name: 'x', lat: 41.9, lng: 12.5 }
    const d = '2027-07-15'
    createCard(doc, { type: 'stay', date: d, time: '15:00', location: at })
    createCard(doc, { type: 'sight', date: d, time: '09:00', location: at })
    const lunch = createCard(doc, { type: 'food', date: d, time: '13:30', location: at })
    const museum = createCard(doc, { type: 'sight', date: d, time: '16:00', location: at })
    const walk = createCard(doc, { type: 'sight', date: d, location: at })
    createCard(doc, { type: 'sight', date: d, time: '14:00' }) // bez współrzędnych
    const cards = readCards(doc)
    expect(nextPlace(cards, d, '13:40')?.id).toBe(lunch) // 13:30 mieści się w 15 min zapasu
    expect(nextPlace(cards, d, '13:50')?.id).toBe(museum)
    expect(nextPlace(cards, d, '20:00')?.id).toBe(walk)
  })
})

import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import {
  arrangeByDays,
  createEdge,
  createFrame,
  deleteFrame,
  moveItems,
  readEdges,
  readFrames,
  restorePositions,
  setEdgeLabel,
  visibleEdges,
} from './board'
import { createCard, purgeTrash, readCards, trashCard } from './trip-doc'

const byId = (doc: Y.Doc, id: string) => readCards(doc).find((c) => c.id === id)

describe('ramki', () => {
  it('karta w ramce dostaje frameId, po wyjęciu go traci', () => {
    const doc = new Y.Doc()
    const card = createCard(doc, { type: 'note', x: 50, y: 50 })
    const frame = createFrame(doc, { x: 0, y: 0, title: 'Rzym' })
    expect(byId(doc, card)?.frameId).toBe(frame)
    moveItems(doc, { cards: { [card]: { x: 2000, y: 2000 } } })
    expect(byId(doc, card)?.frameId).toBeUndefined()
  })

  it('usunięcie ramki zostawia karty', () => {
    const doc = new Y.Doc()
    const card = createCard(doc, { type: 'note', x: 50, y: 50 })
    const frame = createFrame(doc, { x: 0, y: 0 })
    deleteFrame(doc, frame)
    expect(readFrames(doc)).toHaveLength(0)
    expect(byId(doc, card)).toMatchObject({ x: 50, y: 50 })
    expect(byId(doc, card)?.frameId).toBeUndefined()
  })

  it('wybiera najmniejszą z zachodzących ramek', () => {
    const doc = new Y.Doc()
    createFrame(doc, { x: 0, y: 0, w: 2000, h: 2000 })
    const small = createFrame(doc, { x: 0, y: 0, w: 400, h: 300 })
    const card = createCard(doc, { type: 'note', x: 10, y: 10 })
    moveItems(doc, {})
    expect(byId(doc, card)?.frameId).toBe(small)
  })
})

describe('strzałki', () => {
  it('bez pętli i duplikatów; etykieta; ukryte przy karcie w koszu; czyszczone z koszem', () => {
    const doc = new Y.Doc()
    const a = createCard(doc, { type: 'transport' })
    const b = createCard(doc, { type: 'stay' })
    expect(createEdge(doc, a, a)).toBeUndefined()
    const e = createEdge(doc, a, b) as string
    expect(createEdge(doc, a, b)).toBe(e)
    setEdgeLabel(doc, e, ' pociąg 2 h ')
    expect(readEdges(doc)).toEqual([{ id: e, from: a, to: b, label: 'pociąg 2 h' }])

    trashCard(doc, b, new Date('2027-01-01T00:00:00Z'))
    expect(visibleEdges(readEdges(doc), readCards(doc))).toHaveLength(0)
    purgeTrash(doc, new Date('2027-03-01T00:00:00Z'))
    expect(readEdges(doc)).toHaveLength(0)
  })
})

describe('ułóż wg dni', () => {
  it('kolumny dni po godzinie, karty bez daty zostają, cofnij przywraca', () => {
    const doc = new Y.Doc()
    const late = createCard(doc, {
      type: 'sight',
      date: '2027-07-15',
      time: '18:00',
      x: 900,
      y: 900,
    })
    const early = createCard(doc, {
      type: 'food',
      date: '2027-07-15',
      time: '08:00',
      x: 100,
      y: 500,
    })
    const first = createCard(doc, { type: 'stay', date: '2027-07-14', x: 300, y: 300 })
    const loose = createCard(doc, { type: 'note', x: 5, y: 5 })

    const prev = arrangeByDays(doc, readCards(doc), {
      startDate: '2027-07-14',
      endDate: '2027-07-16',
    })
    expect(byId(doc, first)).toMatchObject({ x: 100, y: 300 })
    expect(byId(doc, early)).toMatchObject({ x: 400, y: 300 })
    expect(byId(doc, late)?.x).toBe(400)
    expect(byId(doc, late)?.y).toBeGreaterThan(300)
    expect(byId(doc, loose)).toMatchObject({ x: 5, y: 5 })

    restorePositions(doc, prev)
    expect(byId(doc, late)).toMatchObject({ x: 900, y: 900 })
    expect(byId(doc, early)).toMatchObject({ x: 100, y: 500 })
  })
})

describe('createCard z tekstem', () => {
  it('wklejony tekst to akapity, pierwszy jest tytułem', () => {
    const doc = new Y.Doc()
    createCard(doc, { type: 'note' }, new Date(), 'Pizzeria da Michele\n\nvia Cesare Sersale 1')
    expect(readCards(doc)[0]).toMatchObject({
      title: 'Pizzeria da Michele',
      preview: 'via Cesare Sersale 1',
    })
  })
})

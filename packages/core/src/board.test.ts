import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import {
  arrangeByDays,
  createEdge,
  createFrame,
  dayOrder,
  deleteFrame,
  dropColumns,
  dropTarget,
  moveItems,
  nowLineY,
  readEdges,
  readFrames,
  restorePositions,
  segmentHitsRect,
  setEdgeLabel,
  visibleEdges,
} from './board'
import { type CardSnapshot, isIdea } from './cards'
import {
  addVariant,
  cardsOf,
  chooseVariant,
  createCard,
  detachVariant,
  groupCardsByDay,
  purgeTrash,
  readCards,
  restoreCard,
  trashCard,
  updateCard,
} from './trip-doc'

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
    expect(byId(doc, early)).toMatchObject({ x: 460, y: 300 })
    expect(byId(doc, late)?.x).toBe(460)
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

describe('dayOrder', () => {
  it('grupuje karty z datą po dniach i układa je po godzinie', () => {
    const doc = new Y.Doc()
    const t = (n: number) => new Date(Date.UTC(2027, 0, 1, 0, n))
    const late = createCard(doc, { type: 'sight', date: '2027-07-14', time: '15:00' }, t(1))
    const early = createCard(doc, { type: 'food', date: '2027-07-14', time: '09:00' }, t(2))
    const noTime = createCard(doc, { type: 'note', date: '2027-07-14' }, t(3))
    const next = createCard(doc, { type: 'stay', date: '2027-07-15' }, t(4))
    const gone = createCard(doc, { type: 'note', date: '2027-07-15' }, t(5))
    createCard(doc, { type: 'note' }, t(6))
    trashCard(doc, gone)
    expect(dayOrder(readCards(doc))).toEqual([
      { date: '2027-07-14', ids: [noTime, early, late] },
      { date: '2027-07-15', ids: [next] },
    ])
  })
})

describe('kolumna dnia po godzinach', () => {
  const date = '2027-07-14'
  const column = (doc: Y.Doc) =>
    readCards(doc)
      .sort((a, b) => a.y - b.y)
      .map((c) => c.time)

  it('nowa karta z godziną wchodzi na swoje miejsce', () => {
    const doc = new Y.Doc()
    createCard(doc, { type: 'sight', date, time: '09:30' })
    createCard(doc, { type: 'food', date, time: '19:30' })
    createCard(doc, { type: 'sight', date, time: '11:30' })
    expect(column(doc)).toEqual(['09:30', '11:30', '19:30'])
  })

  it('zmiana godziny przestawia kartę, a kolumna zaczyna się w tym samym miejscu', () => {
    const doc = new Y.Doc()
    const first = createCard(doc, { type: 'sight', date, time: '09:00' })
    createCard(doc, { type: 'food', date, time: '12:00' })
    const top = byId(doc, first)?.y
    updateCard(doc, first, { time: '15:00' })
    expect(column(doc)).toEqual(['12:00', '15:00'])
    expect(Math.min(...readCards(doc).map((c) => c.y))).toBe(top)
  })

  it('poprawna kolejność zostawia ręczne odstępy', () => {
    const doc = new Y.Doc()
    const a = createCard(doc, { type: 'sight', date, time: '09:00', x: 0, y: 0 })
    const b = createCard(doc, { type: 'food', date, time: '12:00', x: 0, y: 900 })
    updateCard(doc, a, { time: '10:00' })
    expect(byId(doc, b)?.y).toBe(900)
  })

  it('dzień ułożony ręcznie zostaje bez zmian', () => {
    const doc = new Y.Doc()
    const a = createCard(doc, { type: 'sight', date, time: '09:00', x: 0, y: 500 })
    const b = createCard(doc, { type: 'food', date, time: '12:00', x: 600, y: 0 })
    updateCard(doc, a, { time: '10:00' })
    expect(byId(doc, a)).toMatchObject({ x: 0, y: 500 })
    expect(byId(doc, b)).toMatchObject({ x: 600, y: 0 })
  })

  it('karty w ramce zostają bez zmian', () => {
    const doc = new Y.Doc()
    const a = createCard(doc, { type: 'sight', date, time: '09:00', x: 0, y: 0 })
    createCard(doc, { type: 'food', date, time: '12:00', x: 0, y: 300 })
    createFrame(doc, { x: -50, y: -50, w: 900, h: 900 })
    updateCard(doc, a, { time: '15:00' })
    expect(byId(doc, a)?.y).toBe(0)
  })
})

describe('nowLineY', () => {
  it('w połowie zwykłej przerwy', () => {
    expect(nowLineY({ bottom: 160 }, { top: 216 })).toBe(188)
  })

  it('pod ostatnią rozpoczętą kartą, gdy następna leży daleko', () => {
    expect(nowLineY({ bottom: 160 }, { top: 1296 })).toBe(190)
  })

  it('pod rozpoczętą kartą, gdy następna leży wyżej', () => {
    expect(nowLineY({ bottom: 1456 }, { top: 216 })).toBe(1486)
  })

  it('przed pierwszą i po ostatniej karcie', () => {
    expect(nowLineY(undefined, { top: 100 })).toBe(84)
    expect(nowLineY({ bottom: 100 }, undefined)).toBe(116)
  })
})

describe('segmentHitsRect', () => {
  const card = { x: 0, y: 100, w: 260, h: 160 }

  it('wykrywa kartę na drodze strzałki', () => {
    expect(segmentHitsRect({ x: 130, y: 0 }, { x: 130, y: 400 }, card)).toBe(true)
  })

  it('pomija kartę obok i przed końcem odcinka', () => {
    expect(segmentHitsRect({ x: 300, y: 0 }, { x: 300, y: 400 }, card)).toBe(false)
    expect(segmentHitsRect({ x: 130, y: 0 }, { x: 130, y: 50 }, card)).toBe(false)
  })
})

describe('upuszczanie na dzień', () => {
  const box = (id: string, top: number, time?: string, durationMin?: number) => ({
    id,
    top,
    bottom: top + 160,
    left: 0,
    right: 260,
    time,
    durationMin,
  })
  const day = { date: '2027-07-14', x: 0, w: 260 }
  const cards = [box('a', 0, '09:00', 60), box('b', 216, '14:00')]
  const columns = [{ ...day, cards }]
  const idea = { id: 'x' }

  it('na karcie to wariant, a poza dniami nic', () => {
    expect(dropTarget({ x: 100, y: 50 }, columns, idea, 10)).toEqual({ kind: 'variant', id: 'a' })
    expect(dropTarget({ x: 900, y: 50 }, columns, idea, 10)).toBeNull()
  })

  it('między kartami podpowiada godzinę po poprzedniej z zapasem', () => {
    expect(dropTarget({ x: 100, y: 188 }, columns, idea, 12)).toMatchObject({
      kind: 'day',
      y: 188,
      time: '10:15',
    })
  })

  it('po karcie bez czasu trwania liczy typowy postój', () => {
    const open = [{ ...day, cards: [box('a', 0, '09:00')] }]
    expect(dropTarget({ x: 100, y: 188 }, open, idea, 10)).toMatchObject({ time: '10:10' })
  })

  it('przed pierwszą kartą liczy wstecz od następnej', () => {
    const late = [{ ...day, cards: [box('b', 216, '14:00')] }]
    expect(dropTarget({ x: 100, y: 100 }, late, idea, 10)).toMatchObject({ time: '12:50' })
  })

  it('własna godzina zostaje, gdy mieści się między sąsiadami', () => {
    expect(dropTarget({ x: 100, y: 188 }, columns, { id: 'x', time: '12:00' }, 10)).toMatchObject({
      time: '12:00',
    })
  })

  it('puste dni wyjazdu stoją w siatce obok dni z kartami', () => {
    const all = dropColumns([{ ...box('a', 0), date: '2027-07-15' }], {
      startDate: '2027-07-14',
      endDate: '2027-07-16',
    })
    expect(all.map((c) => [c.date, c.x]).sort()).toEqual([
      ['2027-07-14', -360],
      ['2027-07-15', 0],
      ['2027-07-16', 360],
    ])
  })
})

describe('warianty', () => {
  const date = '2027-07-14'
  const plan = () => {
    const doc = new Y.Doc()
    const main = createCard(doc, { type: 'food', date, time: '12:00', x: 100, y: 200 })
    const other = createCard(doc, { type: 'food' })
    addVariant(doc, other, main)
    return { doc, main, other }
  }

  it('wariant nie ma dnia, ma godzinę karty głównej i nie jest pomysłem ani punktem planu', () => {
    const { doc, main, other } = plan()
    const card = byId(doc, other)
    expect(card).toMatchObject({ variantOf: main, time: '12:00' })
    expect(card?.date).toBeUndefined()
    expect(isIdea(card as CardSnapshot)).toBe(false)
    expect(dayOrder(readCards(doc))).toEqual([{ date, ids: [main] }])
    expect(groupCardsByDay(readCards(doc)).undated).toEqual([])
  })

  it('wybór zamienia karty miejscami i układa kolumnę', () => {
    const { doc, main, other } = plan()
    chooseVariant(doc, other)
    expect(byId(doc, other)).toMatchObject({ date, x: 100, y: 200, variantChosen: true })
    expect(byId(doc, other)?.variantOf).toBeUndefined()
    expect(byId(doc, main)).toMatchObject({ variantOf: other })
    expect(byId(doc, main)?.date).toBeUndefined()
  })

  it('wariant wariantu trafia do karty głównej, a nowa opcja znów otwiera wybór', () => {
    const { doc, main, other } = plan()
    chooseVariant(doc, main)
    const third = createCard(doc, { type: 'food' })
    addVariant(doc, third, other)
    expect(byId(doc, third)?.variantOf).toBe(main)
    expect(byId(doc, main)?.variantChosen).toBeUndefined()
  })

  it('karta główna w koszu oddaje miejsce wariantowi i wraca do stosu', () => {
    const { doc, main, other } = plan()
    trashCard(doc, main)
    expect(byId(doc, other)).toMatchObject({ date, x: 100, y: 200 })
    restoreCard(doc, main)
    expect(byId(doc, main)).toMatchObject({ variantOf: other })
  })

  it('wyjęty wariant wraca do pomysłów', () => {
    const { doc, main, other } = plan()
    chooseVariant(doc, main)
    detachVariant(doc, other)
    expect(isIdea(byId(doc, other) as CardSnapshot)).toBe(true)
    expect(byId(doc, main)?.variantChosen).toBeUndefined()
  })

  it('wariant bez żywej karty głównej nie znika', () => {
    const { doc, main, other } = plan()
    cardsOf(doc).delete(main)
    expect(isIdea(byId(doc, other) as CardSnapshot)).toBe(true)
  })
})

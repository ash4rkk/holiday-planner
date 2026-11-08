import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { totals } from './amounts'
import { isIdea } from './cards'
import { computeReminders } from './reminders'
import {
  cardsOf,
  contentOf,
  createCard,
  fragmentLines,
  groupCardsByDay,
  moveCardToDay,
  moveToIdeas,
  purgeTrash,
  readCards,
  restoreCard,
  trashCard,
  undoable,
  updateCard,
} from './trip-doc'

function setText(doc: Y.Doc, id: string, blocks: [string, string][]) {
  const fragment = contentOf(cardsOf(doc).get(id) as Y.Map<unknown>)
  doc.transact(() => {
    for (const [name, text] of blocks) {
      const el = new Y.XmlElement(name)
      const t = new Y.XmlText()
      t.insert(0, text)
      el.insert(0, [t])
      fragment.push([el])
    }
  })
}

describe('trip doc', () => {
  it('tworzy kartę z domyślnymi polami i pustą treścią', () => {
    const doc = new Y.Doc()
    const id = createCard(doc, { type: 'food', date: '2027-07-14' })
    const [card] = readCards(doc)
    expect(card).toMatchObject({ id, type: 'food', date: '2027-07-14', pinned: false, title: '' })
    expect(card?.attachmentIds).toEqual([])
  })

  it('tytuł i podgląd z treści', () => {
    const doc = new Y.Doc()
    const id = createCard(doc, { type: 'sight' })
    setText(doc, id, [
      ['heading', 'Koloseum'],
      ['paragraph', 'bilety online'],
      ['paragraph', ''],
      ['paragraph', 'wejście od via Sacra'],
    ])
    const [card] = readCards(doc)
    expect(card?.title).toBe('Koloseum')
    expect(card?.preview).toBe('bilety online · wejście od via Sacra')
  })

  it('linie z zagnieżdżonych list', () => {
    const doc = new Y.Doc()
    const fragment = doc.getXmlFragment('x')
    const list = new Y.XmlElement('taskList')
    const item = new Y.XmlElement('taskItem')
    const p = new Y.XmlElement('paragraph')
    const t = new Y.XmlText()
    t.insert(0, 'paszport')
    p.insert(0, [t])
    item.insert(0, [p])
    list.insert(0, [item])
    fragment.insert(0, [list])
    expect(fragmentLines(fragment)).toEqual(['paszport'])
  })

  it('zmienia i czyści pola', () => {
    const doc = new Y.Doc()
    const id = createCard(doc, { type: 'stay', date: '2027-07-14' })
    updateCard(doc, id, { endDate: '2027-07-16', time: '15:00' })
    updateCard(doc, id, { time: undefined })
    const [card] = readCards(doc)
    expect(card?.endDate).toBe('2027-07-16')
    expect(card?.time).toBeUndefined()
  })

  it('kosz: usuwa, przywraca i czyści po 30 dniach', () => {
    const doc = new Y.Doc()
    const a = createCard(doc, { type: 'note' })
    const b = createCard(doc, { type: 'note' })
    trashCard(doc, a, new Date('2027-01-01T00:00:00Z'))
    trashCard(doc, b, new Date('2027-01-25T00:00:00Z'))
    restoreCard(doc, b)
    trashCard(doc, b, new Date('2027-01-25T00:00:00Z'))
    expect(purgeTrash(doc, new Date('2027-02-05T00:00:00Z'))).toBe(1)
    expect(readCards(doc).map((c) => c.id)).toEqual([b])
  })
})

describe('groupCardsByDay', () => {
  it('przypięte, wszystkie dni wyjazdu, dni spoza zakresu, bez daty i kosz', () => {
    const doc = new Y.Doc()
    const t = (iso: string) => new Date(iso)
    createCard(doc, { type: 'sight', date: '2027-07-15', time: '18:00' }, t('2027-01-01T00:00:01Z'))
    createCard(doc, { type: 'food', date: '2027-07-15', time: '09:30' }, t('2027-01-01T00:00:02Z'))
    createCard(doc, { type: 'stay', date: '2027-07-15' }, t('2027-01-01T00:00:03Z'))
    createCard(doc, { type: 'transport', date: '2027-07-10' }, t('2027-01-01T00:00:04Z'))
    createCard(doc, { type: 'note', pinned: true }, t('2027-01-01T00:00:05Z'))
    createCard(doc, { type: 'note' }, t('2027-01-01T00:00:06Z'))
    const gone = createCard(doc, { type: 'note', date: '2027-07-14' })
    trashCard(doc, gone)

    const g = groupCardsByDay(readCards(doc), { startDate: '2027-07-14', endDate: '2027-07-16' })
    expect(g.pinned).toHaveLength(1)
    expect(g.days.map((d) => [d.date, d.dayIndex, d.cards.length])).toEqual([
      ['2027-07-10', undefined, 1],
      ['2027-07-14', 1, 0],
      ['2027-07-15', 2, 3],
      ['2027-07-16', 3, 0],
    ])
    expect(g.days[2]?.cards.map((c) => c.type)).toEqual(['stay', 'food', 'sight'])
    expect(g.undated).toHaveLength(1)
    expect(g.trash).toHaveLength(1)
  })
})

describe('moveCardToDay', () => {
  it('zmienia dzień i zachowuje godzinę', () => {
    const doc = new Y.Doc()
    const id = createCard(doc, { type: 'sight', date: '2027-07-14', time: '10:00' })
    moveCardToDay(doc, id, '2027-07-16')
    expect(readCards(doc)[0]).toMatchObject({ date: '2027-07-16', time: '10:00' })
  })

  it('nocleg zachowuje liczbę nocy', () => {
    const doc = new Y.Doc()
    const id = createCard(doc, { type: 'stay', date: '2027-07-14', endDate: '2027-07-17' })
    moveCardToDay(doc, id, '2027-07-20')
    expect(readCards(doc)[0]).toMatchObject({ date: '2027-07-20', endDate: '2027-07-23' })
  })

  it('bez dnia karta traci obie daty', () => {
    const doc = new Y.Doc()
    const id = createCard(doc, { type: 'stay', date: '2027-07-14', endDate: '2027-07-17' })
    moveCardToDay(doc, id, undefined)
    expect(readCards(doc)[0]?.date).toBeUndefined()
    expect(readCards(doc)[0]?.endDate).toBeUndefined()
  })
})

describe('miejsce karty na Tablicy', () => {
  it('nowa karta z datą staje pod kartami swojego dnia', () => {
    const doc = new Y.Doc()
    createCard(doc, { type: 'sight', date: '2027-07-14', x: 500, y: 100 })
    createCard(doc, { type: 'note', x: 2000, y: 2000 })
    const id = createCard(doc, { type: 'food', date: '2027-07-14' })
    const card = readCards(doc).find((c) => c.id === id)
    expect(card?.x).toBe(500)
    expect(card?.y).toBeGreaterThan(100)
  })

  it('jawna pozycja wygrywa', () => {
    const doc = new Y.Doc()
    createCard(doc, { type: 'sight', date: '2027-07-14', x: 500, y: 100 })
    const id = createCard(doc, { type: 'food', date: '2027-07-14', x: 7, y: 9 })
    expect(readCards(doc).find((c) => c.id === id)).toMatchObject({ x: 7, y: 9 })
  })

  it('zmiana dnia przenosi kartę do kolumny nowego dnia', () => {
    const doc = new Y.Doc()
    createCard(doc, { type: 'sight', date: '2027-07-15', x: 800, y: 100 })
    const id = createCard(doc, { type: 'food', date: '2027-07-14', x: 100, y: 100 })
    moveCardToDay(doc, id, '2027-07-15')
    expect(readCards(doc).find((c) => c.id === id)?.x).toBe(800)
  })
})

describe('status karty', () => {
  it('stare „zaliczone” czyta się jako ogarnięte, brak statusu zostaje brakiem', () => {
    const doc = new Y.Doc()
    const old = createCard(doc, { type: 'sight' })
    cardsOf(doc).get(old)?.set('status', 'done')
    createCard(doc, { type: 'note' })
    const [a, b] = readCards(doc)
    expect(a?.status).toBe('booked')
    expect(b?.status).toBeUndefined()
  })
})

describe('do pomysłów i pomijanie', () => {
  it('moveToIdeas: bez dnia, bez przypięcia, ramki i pominięcia', () => {
    const doc = new Y.Doc()
    const id = createCard(doc, { type: 'sight', date: '2027-07-14', time: '10:00', pinned: true })
    updateCard(doc, id, { skipped: true })
    moveToIdeas(doc, id)
    const card = readCards(doc).find((c) => c.id === id)
    expect(card?.date).toBeUndefined()
    expect(card?.pinned).toBe(false)
    expect(card?.skipped).toBeUndefined()
    expect(card && isIdea(card)).toBe(true)
  })

  it('pominięta karta: bez przypomnień, dojazdów i w sumie', () => {
    const doc = new Y.Doc()
    const a = createCard(
      doc,
      { type: 'food', date: '2027-07-14', time: '12:00' },
      new Date(),
      'Obiad /+20€',
    )
    createCard(
      doc,
      { type: 'food', date: '2027-07-14', time: '19:00' },
      new Date(),
      'Kolacja /+30€',
    )
    updateCard(doc, a, { skipped: true })
    const cards = readCards(doc)
    expect(computeReminders(cards, 'x', 'Europe/Rome').map((r) => r.title)).toEqual([
      'Kolacja /+30€',
    ])
    expect(totals(cards, () => 4, '2027-07-14', 'EUR').main?.value).toBe(30)
  })
})

describe('undoable', () => {
  it('cofa kosz i przeniesienie do pomysłów, nie ruszając cudzych zmian', () => {
    const doc = new Y.Doc()
    const a = createCard(doc, { type: 'note', date: '2027-07-14', time: '10:00' })
    const b = createCard(doc, { type: 'note', date: '2027-07-14' })
    const trash = undoable(doc, () => trashCard(doc, a))
    updateCard(doc, b, { time: '12:00' })
    trash.undo()
    expect(readCards(doc).find((c) => c.id === a)?.deletedAt).toBeUndefined()
    expect(readCards(doc).find((c) => c.id === b)?.time).toBe('12:00')

    const ideas = undoable(doc, () => moveToIdeas(doc, a))
    expect(readCards(doc).find((c) => c.id === a)?.date).toBeUndefined()
    ideas.undo()
    expect(readCards(doc).find((c) => c.id === a)?.date).toBe('2027-07-14')
    ideas.undo()
    expect(readCards(doc).find((c) => c.id === a)?.date).toBe('2027-07-14')
  })
})

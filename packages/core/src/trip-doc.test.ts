import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import {
  cardsOf,
  contentOf,
  createCard,
  fragmentLines,
  groupCardsByDay,
  purgeTrash,
  readCards,
  restoreCard,
  trashCard,
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

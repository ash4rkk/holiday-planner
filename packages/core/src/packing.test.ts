import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import {
  addPackingItem,
  copyPacking,
  readPacking,
  removePackingItem,
  showPackingBar,
  updatePackingItem,
} from './packing'
import { undoable } from './trip-doc'

describe('lista pakowania', () => {
  it('kategorie w ustalonej kolejności, osoba, spakowane', () => {
    const doc = new Y.Doc()
    addPackingItem(doc, { text: 'ładowarka', category: 'elektronika' }, new Date('2027-01-01'))
    const passport = addPackingItem(doc, { text: 'paszport', category: 'dokumenty', owner: 'Ola' })
    updatePackingItem(doc, passport, { packed: true })
    const list = readPacking(doc)
    expect(list.map((i) => i.text)).toEqual(['paszport', 'ładowarka'])
    expect(list[0]).toMatchObject({ owner: 'Ola', packed: true })
    updatePackingItem(doc, passport, { owner: undefined })
    expect(readPacking(doc)[0]?.owner).toBeUndefined()
  })

  it('kopia z innego wyjazdu bez zaznaczeń i powtórzeń; usunięcie z cofnięciem', () => {
    const old = new Y.Doc()
    const id = addPackingItem(old, { text: 'Krem z filtrem', category: 'kosmetyki' })
    updatePackingItem(old, id, { packed: true })
    addPackingItem(old, { text: 'adapter' })
    const doc = new Y.Doc()
    addPackingItem(doc, { text: 'krem z filtrem' })
    expect(copyPacking(doc, readPacking(old))).toBe(1)
    expect(readPacking(doc).every((i) => !i.packed)).toBe(true)
    const adapter = readPacking(doc).find((i) => i.text === 'adapter')?.id as string
    const { undo } = undoable(doc, () => removePackingItem(doc, adapter))
    expect(readPacking(doc)).toHaveLength(1)
    undo()
    expect(readPacking(doc)).toHaveLength(2)
  })
})

describe('pasek pakowania w „dziś”', () => {
  it('tylko w ustawionym oknie przed pierwszym dniem', () => {
    expect(showPackingBar('2027-05-07', '2027-05-10', 3)).toBe(true)
    expect(showPackingBar('2027-05-09', '2027-05-10', 3)).toBe(true)
    expect(showPackingBar('2027-05-06', '2027-05-10', 3)).toBe(false)
    expect(showPackingBar('2027-05-10', '2027-05-10', 3)).toBe(false)
    expect(showPackingBar('2027-05-12', '2027-05-10', 3)).toBe(false)
  })

  it('0 dni lub brak daty = bez paska', () => {
    expect(showPackingBar('2027-05-09', '2027-05-10', 0)).toBe(false)
    expect(showPackingBar('2027-05-09', null, 3)).toBe(false)
  })
})

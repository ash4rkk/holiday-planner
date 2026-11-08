import { createCard, updateCard } from '@planer/core'
import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { getSnapshot, share, subscribe } from './trip-doc'

describe('migawki dokumentu wyjazdu', () => {
  it('zmiana między pierwszym odczytem a subskrypcją nie zostawia pustej migawki', () => {
    const doc = new Y.Doc()
    // Render: dokument jeszcze pusty (IndexedDB i sync nie zdążyły).
    expect(getSnapshot(doc, 'cards')).toEqual([])
    // Dane przychodzą, zanim komponent podepnie subskrypcję.
    const remote = new Y.Doc()
    createCard(remote, { type: 'sight', date: '2026-11-07' }, new Date(), 'Oceanário')
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(remote))
    // useSyncExternalStore po subskrypcji czyta migawkę jeszcze raz — musi być świeża.
    const unsubscribe = subscribe(doc, 'cards', () => {})
    expect(getSnapshot(doc, 'cards').map((c) => c.title)).toEqual(['Oceanário'])
    unsubscribe()
  })

  it('bez zmian ta sama referencja; po zmianie nowa', () => {
    const doc = new Y.Doc()
    let calls = 0
    const unsubscribe = subscribe(doc, 'cards', () => calls++)
    const first = getSnapshot(doc, 'cards')
    expect(getSnapshot(doc, 'cards')).toBe(first)
    createCard(doc, { type: 'food' }, new Date(), 'Kolacja')
    expect(calls).toBeGreaterThan(0)
    expect(getSnapshot(doc, 'cards')).not.toBe(first)
    unsubscribe()
  })
})

describe('współdzielenie migawek', () => {
  it('zmiana jednej karty zostawia obiekty pozostałych; brak zmian — ta sama tablica', () => {
    const doc = new Y.Doc()
    const a = createCard(doc, { type: 'note' }, new Date(), 'A')
    const b = createCard(doc, { type: 'note' }, new Date(), 'B')
    const first = getSnapshot(doc, 'cards')
    updateCard(doc, a, { time: '10:00' })
    const second = getSnapshot(doc, 'cards')
    expect(second).not.toBe(first)
    expect(second.find((c) => c.id === b)).toBe(first.find((c) => c.id === b))
    expect(second.find((c) => c.id === a)).not.toBe(first.find((c) => c.id === a))
    expect(
      share(
        second,
        second.map((c) => ({ ...c })),
      ),
    ).toBe(second)
  })
})

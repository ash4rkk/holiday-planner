'use client'

import { type CardSnapshot, cardsOf, purgeTrash, readCards } from '@planer/core'
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from 'react'
import { IndexeddbPersistence } from 'y-indexeddb'
import * as Y from 'yjs'

// Jeden dokument Yjs na wyjazd, trzymany w IndexedDB urządzenia (etap 3 doda sync z serwerem).
// Dokumenty żyją w pamięci przez całą sesję, żeby przejścia Lista ↔ Tablica nie czytały bazy od nowa.

type Entry = { doc: Y.Doc; persistence: IndexeddbPersistence; synced: Promise<void> }
const entries = new Map<string, Entry>()

function openTripDoc(tripId: string): Entry {
  let entry = entries.get(tripId)
  if (!entry) {
    const doc = new Y.Doc()
    const persistence = new IndexeddbPersistence(`planer-trip-${tripId}`, doc)
    const synced = persistence.whenSynced.then(() => {
      purgeTrash(doc)
    })
    entry = { doc, persistence, synced }
    entries.set(tripId, entry)
  }
  return entry
}

export type TripMeta = {
  id: string
  title: string
  startDate: string | null
  endDate: string | null
  currencies: string[]
  archived: boolean
}

type Ctx = { trip: TripMeta; doc: Y.Doc; ready: boolean }
const TripContext = createContext<Ctx | null>(null)

export function TripProvider({ trip, children }: { trip: TripMeta; children: ReactNode }) {
  const [entry] = useState(() => (typeof window === 'undefined' ? null : openTripDoc(trip.id)))
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let alive = true
    entry?.synced.then(() => alive && setReady(true))
    return () => {
      alive = false
    }
  }, [entry])

  // Na serwerze (SSR) pusty dokument; prawdziwy powstaje dopiero w przeglądarce.
  const [ssrDoc] = useState(() => new Y.Doc())
  return (
    <TripContext.Provider value={{ trip, doc: entry?.doc ?? ssrDoc, ready }}>
      {children}
    </TripContext.Provider>
  )
}

export function useTrip(): Ctx {
  const ctx = useContext(TripContext)
  if (!ctx) throw new Error('useTrip poza TripProvider')
  return ctx
}

// Migawka kart przeliczana przy każdej zmianie dokumentu; ta sama referencja między zmianami.
const snapshots = new WeakMap<Y.Doc, CardSnapshot[]>()
const EMPTY: CardSnapshot[] = []

function subscribe(doc: Y.Doc, onChange: () => void) {
  const cards = cardsOf(doc)
  const handler = () => {
    snapshots.delete(doc)
    onChange()
  }
  cards.observeDeep(handler)
  return () => cards.unobserveDeep(handler)
}

function getSnapshot(doc: Y.Doc): CardSnapshot[] {
  let snap = snapshots.get(doc)
  if (!snap) {
    snap = readCards(doc)
    snapshots.set(doc, snap)
  }
  return snap
}

export function useCards(): CardSnapshot[] {
  const { doc } = useTrip()
  return useSyncExternalStore(
    (cb) => subscribe(doc, cb),
    () => getSnapshot(doc),
    () => EMPTY,
  )
}

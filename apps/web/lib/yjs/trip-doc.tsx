'use client'

import {
  type CardSnapshot,
  type EdgeSnapshot,
  type FrameSnapshot,
  purgeTrash,
  readCards,
  readEdges,
  readFrames,
} from '@planer/core'
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

// Migawki map dokumentu (karty, ramki, strzałki) przeliczane przy zmianie; ta sama referencja
// między zmianami, więc useSyncExternalStore nie renderuje bez potrzeby.
type Key = 'cards' | 'frames' | 'edges'
const READERS = { cards: readCards, frames: readFrames, edges: readEdges }
const snapshots = new WeakMap<Y.Doc, Partial<Record<Key, unknown>>>()
const EMPTY: never[] = []

function subscribe(doc: Y.Doc, key: Key, onChange: () => void) {
  const map = doc.getMap(key)
  const handler = () => {
    const cache = snapshots.get(doc)
    if (cache) delete cache[key]
    onChange()
  }
  map.observeDeep(handler)
  return () => map.unobserveDeep(handler)
}

function getSnapshot<K extends Key>(doc: Y.Doc, key: K): ReturnType<(typeof READERS)[K]> {
  let cache = snapshots.get(doc)
  if (!cache) {
    cache = {}
    snapshots.set(doc, cache)
  }
  if (!(key in cache)) cache[key] = READERS[key](doc)
  return cache[key] as ReturnType<(typeof READERS)[K]>
}

function useDocMap<K extends Key>(key: K): ReturnType<(typeof READERS)[K]> {
  const { doc } = useTrip()
  return useSyncExternalStore(
    (cb) => subscribe(doc, key, cb),
    () => getSnapshot(doc, key),
    () => EMPTY as ReturnType<(typeof READERS)[K]>,
  )
}

export function useCards(): CardSnapshot[] {
  return useDocMap('cards')
}

export function useFrames(): FrameSnapshot[] {
  return useDocMap('frames')
}

export function useEdges(): EdgeSnapshot[] {
  return useDocMap('edges')
}

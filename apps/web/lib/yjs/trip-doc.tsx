'use client'

import { HocuspocusProvider, WebSocketStatus } from '@hocuspocus/provider'
import type { TravelMode } from '@planer/core'
import {
  type AttachmentMeta,
  type CardSnapshot,
  type EdgeSnapshot,
  type FrameSnapshot,
  purgeTrash,
  readAttachments,
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
import { OfflinePrefetch } from '@/components/offline-prefetch'
import type { Template } from '@/lib/card-templates'
import { useInboxIdeas } from '@/lib/use-inbox-ideas'

// Jeden dokument Yjs na wyjazd: kopia w IndexedDB urządzenia (pełna praca offline) i sync na żywo
// przez WebSocket z serwerem Hocuspocus (apps/sync). Dokumenty i połączenia żyją przez całą sesję,
// żeby przejścia Lista ↔ Tablica nie łączyły się od nowa.

export type SyncStatus = 'connecting' | 'live' | 'offline' | 'login'

export type PresenceUser = { name: string; color: string }

type Entry = {
  doc: Y.Doc
  persistence: IndexeddbPersistence
  provider: HocuspocusProvider
  ready: Promise<void>
  status: SyncStatus
  listeners: Set<() => void>
}
const entries = new Map<string, Entry>()

/** Adres serwera sync: w dev osobny port (NEXT_PUBLIC_SYNC_URL), na serwerze ta sama domena /sync. */
export function syncUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SYNC_URL
  const { protocol, host, hostname } = window.location
  if (configured) {
    // Telefon w sieci lokalnej: „localhost” to sam telefon, więc bierzemy host, z którego wczytano stronę.
    const url = new URL(configured)
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') url.hostname = hostname
    return url.toString().replace(/\/$/, '')
  }
  return `${protocol === 'https:' ? 'wss' : 'ws'}://${host}/sync`
}

/** Sesja Cloudflare Access wygasła, gdy zwykłe żądanie do aplikacji jest przekierowane lub odrzucone. */
async function sessionExpired(): Promise<boolean> {
  try {
    const res = await fetch('/api/session', { redirect: 'manual', cache: 'no-store' })
    return res.type === 'opaqueredirect' || res.status === 401 || res.status === 403
  } catch {
    return false // brak sieci to nie wygasła sesja
  }
}

/** Ostatnia udana synchronizacja na tym urządzeniu (ms) — dla ustawień. */
export const LAST_SYNC_KEY = 'planer-last-sync'
let lastMark = 0
function markSynced() {
  // Przy ciągłej edycji zapis najwyżej co 30 s.
  if (Date.now() - lastMark < 30_000) return
  lastMark = Date.now()
  try {
    localStorage.setItem(LAST_SYNC_KEY, String(lastMark))
  } catch {}
}

function setStatus(entry: Entry, status: SyncStatus) {
  if (status === 'live') markSynced()
  if (entry.status === status) return
  entry.status = status
  for (const listener of entry.listeners) listener()
}

function openTripDoc(tripId: string, user: PresenceUser): Entry {
  let entry = entries.get(tripId)
  if (entry) return entry

  const doc = new Y.Doc()
  const persistence = new IndexeddbPersistence(`planer-trip-${tripId}`, doc)
  const provider = new HocuspocusProvider({ url: syncUrl(), name: tripId, document: doc })
  const created: Entry = {
    doc,
    persistence,
    provider,
    ready: persistence.whenSynced.then(() => {
      purgeTrash(doc)
    }),
    status: 'connecting',
    listeners: new Set(),
  }
  entry = created
  provider.awareness?.setLocalStateField('user', user)

  let failures = 0
  let socket: WebSocketStatus = WebSocketStatus.Connecting
  provider.on('synced', () => {
    failures = 0
    lastMark = 0
    setStatus(created, 'live')
  })
  // Zmiany wysłane lub odebrane na żywo też liczą się jako synchronizacja.
  doc.on('update', () => {
    if (created.status === 'live') markSynced()
  })
  provider.on('status', ({ status }: { status: WebSocketStatus }) => {
    socket = status
    if (status === WebSocketStatus.Connected) return // „na żywo” dopiero po synced
    if (status === WebSocketStatus.Disconnected) {
      failures++
      setStatus(created, 'offline')
      // Po kilku nieudanych próbach przy działającej sieci sprawdzamy, czy to nie wygasła sesja.
      if (failures >= 2 && navigator.onLine) {
        void sessionExpired().then((expired) => expired && setStatus(created, 'login'))
      }
    }
  })
  window.addEventListener('offline', () => setStatus(created, 'offline'))
  // Krótka przerwa sieci nie zawsze zrywa WebSocket — wtedy nie ma ponownego „synced”.
  window.addEventListener('online', () => {
    if (socket === WebSocketStatus.Connected && provider.isSynced) setStatus(created, 'live')
  })

  entries.set(tripId, created)
  return created
}

export type TripMeta = {
  id: string
  title: string
  startDate: string | null
  endDate: string | null
  currencies: string[]
  archived: boolean
  /** Szablony kart (z serwera; w zapisanej stronie działają też offline). */
  templates: Template[]
  travelMode: TravelMode
  travelBufferMin: number
  timezone: string
  /** Flaga kraju (komponent serwerowy z layoutu, żeby zestaw flag nie trafiał do bundla klienta). */
  flag?: ReactNode
}

type Ctx = {
  trip: TripMeta
  user: PresenceUser
  doc: Y.Doc
  provider: HocuspocusProvider | null
  ready: boolean
  /** Szablony kart: z serwera plus zapisane w tej sesji (bez router.refresh przy otwartej karcie). */
  templates: Template[]
  addTemplate: (t: Template) => void
}
const TripContext = createContext<Ctx | null>(null)

export function TripProvider({
  trip,
  user,
  children,
}: {
  trip: TripMeta
  user: PresenceUser
  children: ReactNode
}) {
  const [entry] = useState(() =>
    typeof window === 'undefined' ? null : openTripDoc(trip.id, user),
  )
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let alive = true
    entry?.ready.then(() => alive && setReady(true))
    return () => {
      alive = false
    }
  }, [entry])

  const [templates, setTemplates] = useState(trip.templates)
  useEffect(() => setTemplates(trip.templates), [trip.templates])

  // Na serwerze (SSR) pusty dokument; prawdziwy powstaje dopiero w przeglądarce.
  const [ssrDoc] = useState(() => new Y.Doc())
  // Udostępnione miejsca → pomysły (dopiero po wczytaniu dokumentu z IndexedDB).
  useInboxIdeas(trip.id, entry?.doc ?? ssrDoc, ready && !!entry)
  return (
    <TripContext.Provider
      value={{
        trip,
        user,
        doc: entry?.doc ?? ssrDoc,
        provider: entry?.provider ?? null,
        ready,
        templates,
        addTemplate: (t) => setTemplates((list) => [...list, t]),
      }}
    >
      <OfflinePrefetch tripId={trip.id} />
      {children}
    </TripContext.Provider>
  )
}

export function useTrip(): Ctx {
  const ctx = useContext(TripContext)
  if (!ctx) throw new Error('useTrip poza TripProvider')
  return ctx
}

export function useSyncStatus(): SyncStatus {
  const { trip } = useTrip()
  return useSyncExternalStore(
    (cb) => {
      const entry = entries.get(trip.id)
      entry?.listeners.add(cb)
      return () => entry?.listeners.delete(cb)
    },
    () => entries.get(trip.id)?.status ?? 'connecting',
    () => 'connecting',
  )
}

/** Stany obecności innych osób (bez własnego) — awatary, kursory. */
export function usePresence<T = Record<string, unknown>>(): (T & { clientId: number })[] {
  const { provider } = useTrip()
  const [states, setStates] = useState<(T & { clientId: number })[]>([])
  useEffect(() => {
    const awareness = provider?.awareness
    if (!awareness) return
    const update = () =>
      setStates(
        [...awareness.getStates().entries()]
          .filter(([id, state]) => id !== awareness.clientID && state.user)
          .map(([clientId, state]) => ({ ...(state as T), clientId })),
      )
    update()
    awareness.on('change', update)
    return () => awareness.off('change', update)
  }, [provider])
  return states
}

// Migawki map dokumentu (karty, ramki, strzałki) przeliczane przy zmianie; ta sama referencja
// między zmianami, więc useSyncExternalStore nie renderuje bez potrzeby.
//
// Ważność migawki wyznacza licznik zmian, który podbija stały obserwator podpięty przy pierwszym
// odczycie — nie obserwator subskrybenta. Inaczej zmiana z IndexedDB albo sync, która przyjdzie
// między renderem a podpięciem subskrypcji (wejście w wyjazd), zostawiała pustą migawkę na stałe,
// aż do odświeżenia strony.
type Key = 'cards' | 'frames' | 'edges' | 'attachments'
const READERS = {
  cards: readCards,
  frames: readFrames,
  edges: readEdges,
  attachments: readAttachments,
}
const KEYS = Object.keys(READERS) as Key[]
const versions = new WeakMap<Y.Doc, Record<Key, number>>()
const snapshots = new WeakMap<Y.Doc, Partial<Record<Key, { version: number; value: unknown }>>>()
const EMPTY: never[] = []

function versionsOf(doc: Y.Doc): Record<Key, number> {
  let v = versions.get(doc)
  if (!v) {
    const created = { cards: 0, frames: 0, edges: 0, attachments: 0 }
    for (const key of KEYS) doc.getMap(key).observeDeep(() => created[key]++)
    versions.set(doc, created)
    v = created
  }
  return v
}

export function subscribe(doc: Y.Doc, key: Key, onChange: () => void) {
  versionsOf(doc) // stały obserwator musi być pierwszy, żeby licznik rósł przed onChange
  const map = doc.getMap(key)
  map.observeDeep(onChange)
  return () => map.unobserveDeep(onChange)
}

export function getSnapshot<K extends Key>(doc: Y.Doc, key: K): ReturnType<(typeof READERS)[K]> {
  const version = versionsOf(doc)[key]
  let cache = snapshots.get(doc)
  if (!cache) {
    cache = {}
    snapshots.set(doc, cache)
  }
  const hit = cache[key]
  if (hit && hit.version === version) return hit.value as ReturnType<(typeof READERS)[K]>
  const value = share(hit?.value as Identified[] | undefined, READERS[key](doc) as Identified[])
  cache[key] = { version, value }
  return value as ReturnType<(typeof READERS)[K]>
}

type Identified = { id: string }
const shapes = new WeakMap<object, string>()
const shape = (item: object) => {
  let s = shapes.get(item)
  if (s === undefined) {
    s = JSON.stringify(item)
    shapes.set(item, s)
  }
  return s
}

/**
 * Współdzielenie niezmienionych elementów z poprzednią migawką: pisanie w jednej karcie zmienia
 * tylko jej obiekt, więc kafelki pozostałych (memo) się nie przerysowują. Gdy nic się nie zmieniło
 * (np. zmiana w innej części dokumentu), wraca ta sama tablica.
 */
export function share<T extends Identified>(prev: T[] | undefined, next: T[]): T[] {
  if (!prev?.length) return next
  const old = new Map(prev.map((item) => [item.id, item]))
  let same = prev.length === next.length
  const out = next.map((item, i) => {
    const before = old.get(item.id)
    const reused = before && shape(before) === shape(item) ? before : item
    if (reused !== prev[i]) same = false
    return reused
  })
  return same ? prev : out
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

export function useAttachments(): AttachmentMeta[] {
  return useDocMap('attachments')
}

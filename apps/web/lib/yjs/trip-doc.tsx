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
function syncUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SYNC_URL
  if (configured) return configured
  const { protocol, host } = window.location
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

function setStatus(entry: Entry, status: SyncStatus) {
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
    setStatus(created, 'live')
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
  /** Miejsca w skrzynce do rozdzielenia (z serwera przy renderze). */
  inboxCount: number
  /** Szablony kart (z serwera; w zapisanej stronie działają też offline). */
  templates: Template[]
  travelMode: TravelMode
  travelBufferMin: number
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
type Key = 'cards' | 'frames' | 'edges' | 'attachments'
const READERS = {
  cards: readCards,
  frames: readFrames,
  edges: readEdges,
  attachments: readAttachments,
}
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

export function useAttachments(): AttachmentMeta[] {
  return useDocMap('attachments')
}

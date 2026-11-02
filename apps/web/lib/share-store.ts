// Udostępnienia w IndexedDB, wspólne dla service workera i strony (bez Reacta i Next):
//   pending — dane z „Udostępnij → Planer”, czekają na wybór wyjazdu,
//   outbox  — wybrane, czekają na wysłanie (offline: do powrotu sieci).

export type PendingShare = {
  id: string
  title?: string
  text?: string
  url?: string
  files: File[]
  createdAt: number
}

export type OutboxShare = {
  clientKey: string
  tripId: string
  title?: string
  text?: string
  url?: string
  note?: string
  createdAt: number
}

type Stores = { pending: PendingShare; outbox: OutboxShare }

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('planer-share', 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore('pending', { keyPath: 'id' })
      req.result.createObjectStore('outbox', { keyPath: 'clientKey' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function run<T>(
  store: keyof Stores,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb()
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(store, mode).objectStore(store))
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  } finally {
    db.close()
  }
}

export const shareStore = {
  put: <K extends keyof Stores>(store: K, value: Stores[K]) =>
    run(store, 'readwrite', (s) => s.put(value)),
  all: <K extends keyof Stores>(store: K) =>
    run(store, 'readonly', (s) => s.getAll() as IDBRequest<Stores[K][]>),
  delete: (store: keyof Stores, key: string) => run(store, 'readwrite', (s) => s.delete(key)),
}

export function randomId(): string {
  return crypto.randomUUID()
}

import { attachmentUrl } from '@planer/core'

const CACHE = 'attachments'
const running = new Set<string>()

/**
 * Pobiera wszystkie pliki wyjazdu do pamięci (ta sama, z której czyta service worker), żeby bilety
 * i rezerwacje otwierały się bez zasięgu. Pomija pliki już zapisane; po cichu przerywa bez sieci.
 */
export async function prefetchTripFiles(tripId: string): Promise<number> {
  if (typeof caches === 'undefined' || !navigator.onLine || running.has(tripId)) return 0
  running.add(tripId)
  try {
    const res = await fetch(`/api/attachments?tripId=${tripId}`, {
      cache: 'no-store',
      redirect: 'manual',
    })
    if (!res.ok) return 0
    const list = (await res.json()) as { id: string }[]
    const cache = await caches.open(CACHE)
    let added = 0
    for (const { id } of list) {
      const url = attachmentUrl(id)
      if (await cache.match(url)) continue
      const file = await fetch(url, { redirect: 'manual' })
      if (file.status !== 200) break
      await cache.put(url, file)
      added++
    }
    return added
  } catch {
    return 0
  } finally {
    running.delete(tripId)
  }
}

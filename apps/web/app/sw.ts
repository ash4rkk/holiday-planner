/// <reference lib="webworker" />
import { defaultCache } from '@serwist/turbopack/worker'
import { type PrecacheEntry, Serwist, type SerwistGlobalConfig } from 'serwist'
import { randomId, shareStore } from '../lib/share-store'

// Service worker Planera: precache zasobów builda, strony i dane RSC odwiedzonych ekranów
// (NetworkFirst z defaultCache), więc wyjazd otwiera się bez zasięgu. Karty i tak są w IndexedDB.

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}

declare const self: ServiceWorkerGlobalScope

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
  fallbacks: {
    entries: [{ url: '/offline', matcher: ({ request }) => request.destination === 'document' }],
  },
})

// „Udostępnij → Planer” (share_target w manifeście): dane do IndexedDB i przejście na ekran wyboru
// wyjazdu. Działa bez sieci; nasz nasłuch jest przed Serwistem, więc to on odpowiada na ten POST.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'POST' || url.pathname !== '/share/receive') return
  event.respondWith(
    (async () => {
      const form = await event.request.formData()
      const text = (key: string) => {
        const value = form.get(key)
        return typeof value === 'string' && value.trim() ? value : undefined
      }
      await shareStore.put('pending', {
        id: randomId(),
        title: text('title'),
        text: text('text'),
        url: text('url'),
        files: form.getAll('files').filter((f): f is File => f instanceof File && f.size > 0),
        createdAt: Date.now(),
      })
      return Response.redirect('/share', 303)
    })(),
  )
})

serwist.addEventListeners()

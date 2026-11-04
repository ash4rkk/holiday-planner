/// <reference lib="webworker" />
import { defaultCache } from '@serwist/turbopack/worker'
import {
  CacheableResponsePlugin,
  CacheFirst,
  NetworkOnly,
  type PrecacheEntry,
  Serwist,
  type SerwistGlobalConfig,
} from 'serwist'
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
  runtimeCaching: [
    // Załączniki są niezmienne (nowa wersja = nowe id): z pamięci, sieć tylko za pierwszym razem.
    // Tę samą pamięć wypełnia z góry lib/offline-files.ts. Tylko 200 — przekierowanie Access nie trafi do cache.
    {
      matcher: ({ url, sameOrigin }) =>
        sameOrigin && /^\/api\/attachments\/[0-9a-f-]{36}$/.test(url.pathname),
      handler: new CacheFirst({
        cacheName: 'attachments',
        plugins: [new CacheableResponsePlugin({ statuses: [200] })],
      }),
    },
    // Status sesji, eksport i AI zawsze z sieci — defaultCache trzymałby je 24 h mimo no-store.
    {
      matcher: ({ url, sameOrigin }) =>
        sameOrigin && /^\/api\/(?:session|export|ai)(?:\/|$)/.test(url.pathname),
      handler: new NetworkOnly(),
    },
    ...defaultCache,
  ],
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

// Web Push: przypomnienia z kart (worker) i zmiany drugiej osoby (serwer sync).
self.addEventListener('push', (event) => {
  let data: { title?: string; body?: string; url?: string; tag?: string } = {}
  try {
    data = event.data?.json() ?? {}
  } catch {
    data = { body: event.data?.text() }
  }
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'Planer', {
      body: data.body,
      tag: data.tag,
      icon: '/icons/192.png',
      data: { url: data.url ?? '/' },
    }),
  )
})

// Dotknięcie powiadomienia: otwarte okno Planera przechodzi do karty, inaczej nowe okno.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(
    (event.notification.data as { url?: string })?.url ?? '/',
    self.location.origin,
  ).href
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const client = windows.find((w) => new URL(w.url).origin === self.location.origin)
      if (client) {
        await client.focus()
        await client.navigate(url)
      } else await self.clients.openWindow(url)
    })(),
  )
})

serwist.addEventListeners()

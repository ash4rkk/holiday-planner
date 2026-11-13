'use client'

import { attachFile, attachmentUrl, type CardType, createCard } from '@planer/core'
import type * as Y from 'yjs'
import type { ImportDraft } from '@/app/api/ai/import/route'
import { type ImportJob, randomId, shareStore } from './share-store'

// Import AI: zdjęcie/PDF → kolejka w IndexedDB → (z siecią) upload załącznika → /api/ai/import →
// karta-szkic (aiDraft) z plikiem. Offline pliki czekają w kolejce do powrotu sieci.

type State = { busy: string | null; queued: number; error: string | null; fresh: string[] }
let state: State = { busy: null, queued: 0, error: null, fresh: [] }
const listeners = new Set<() => void>()
const set = (patch: Partial<State>) => {
  state = { ...state, ...patch }
  for (const l of listeners) l()
}

export const importStore = {
  subscribe: (cb: () => void) => {
    listeners.add(cb)
    return () => listeners.delete(cb)
  },
  get: () => state,
  dismissError: () => set({ error: null }),
  /** Szkic obejrzany (zatwierdzony, poprawiany albo odrzucony) — znika z okienka przeglądu. */
  reviewed: (cardId: string) => set({ fresh: state.fresh.filter((id) => id !== cardId) }),
}

export async function enqueueImport(tripId: string, files: File[]) {
  for (const file of files)
    await shareStore.put('imports', { id: randomId(), tripId, file, createdAt: Date.now() })
}

/** Treść karty z rozpoznanych danych: tytuł, kluczowe pola, kwota w składni /+, uwagi. */
export function draftLines(d: ImportDraft): string {
  return [
    d.title,
    ...d.details.map((x) => `${x.label}: ${x.value}`),
    d.amount &&
      `kwota: /+${String(d.amount.value).replace('.', ',')}${d.amount.currency === 'PLN' ? '' : ` ${d.amount.currency}`}`,
    d.notes,
  ]
    .filter(Boolean)
    .join('\n')
}

class PermanentError extends Error {}

/** Tyle razy serwer może nie odczytać pliku, zanim zadanie odpadnie (każda próba kosztuje). */
const MAX_ATTEMPTS = 3

async function upload(job: ImportJob): Promise<NonNullable<ImportJob['attachment']>> {
  const form = new FormData()
  form.set('tripId', job.tripId)
  form.set('file', job.file)
  const up = await fetch('/api/attachments', { method: 'POST', body: form })
  const meta = await up.json().catch(() => ({}))
  if (!up.ok) {
    if (up.status >= 400 && up.status < 500)
      throw new PermanentError(meta.error ?? 'nie udało się wysłać pliku')
    throw new Error('upload')
  }
  // Zapis od razu: gdy odczyt AI się nie uda, ponowienie nie wyśle pliku drugi raz.
  await shareStore.put('imports', { ...job, attachment: meta })
  return meta
}

async function processJob(doc: Y.Doc, job: ImportJob): Promise<string> {
  const meta = job.attachment ?? (await upload(job))
  const res = await fetch('/api/ai/import', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tripId: job.tripId, attachmentId: meta.id }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (res.status >= 400 && res.status < 500 && res.status !== 401 && res.status !== 403) {
      throw new PermanentError(body.error ?? 'AI nie odczytało pliku')
    }
    // Serwer odpowiedział błędem (nie brak sieci): liczymy próby, żeby plik nie krążył bez końca.
    const attempts = (job.attempts ?? 0) + 1
    if (res.status !== 401 && res.status !== 403) {
      if (attempts >= MAX_ATTEMPTS) throw new PermanentError(body.error ?? 'AI nie odczytało pliku')
      await shareStore.put('imports', { ...job, attachment: meta, attempts })
    }
    throw new Error('import')
  }
  const d = body.draft as ImportDraft
  const id = createCard(
    doc,
    {
      type: d.type as CardType,
      ...(d.date && { date: d.date }),
      ...(d.time && { time: d.time }),
      ...(d.endTime && { endTime: d.endTime }),
      ...(d.endDate && { endDate: d.endDate }),
      ...(d.location && { location: d.location }),
      ...(d.destination && { destination: d.destination }),
      // Bilet, rezerwacja i paragon to rzeczy już załatwione.
      ...(d.type !== 'note' && { status: 'booked' as const }),
      aiDraft: true,
    },
    new Date(),
    draftLines(d),
  )
  attachFile(doc, { ...(meta as unknown as Parameters<typeof attachFile>[1]), cardId: id })
  void caches
    ?.open('attachments')
    .then((c) => c.add(attachmentUrl(meta.id)))
    .catch(() => {})
  return id
}

const running = new Set<string>()

/** Przetwarza kolejkę importu wyjazdu (po jednym pliku). */
export async function runImports(tripId: string, doc: Y.Doc) {
  if (running.has(tripId)) return
  running.add(tripId)
  try {
    for (;;) {
      const jobs = (await shareStore.all('imports'))
        .filter((j) => j.tripId === tripId)
        .sort((a, b) => a.createdAt - b.createdAt)
      set({ queued: jobs.length })
      const job = jobs[0]
      if (!job || !navigator.onLine) break
      set({ busy: job.file.name || 'plik' })
      try {
        const cardId = await processJob(doc, job)
        await shareStore.delete('imports', job.id)
        set({ fresh: [...state.fresh, cardId] })
      } catch (error) {
        if (error instanceof PermanentError) {
          await shareStore.delete('imports', job.id)
          set({ error: `${job.file.name}: ${error.message}` })
        } else break // sieć — spróbujemy po powrocie
      } finally {
        set({ busy: null })
      }
    }
  } finally {
    running.delete(tripId)
    const left = (await shareStore.all('imports').catch(() => [])).filter(
      (j) => j.tripId === tripId,
    ).length
    set({ queued: left })
  }
}

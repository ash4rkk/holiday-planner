'use client'

import { formatDateSpan, parseShared } from '@planer/core'
import { MapPin, Paperclip } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { TopBar } from '@/components/top-bar'
import { buttonClass, cx, Field, inputClass, SectionLabel } from '@/components/ui'
import { flushOutbox } from '@/lib/outbox'
import { type PendingShare, randomId, shareStore } from '@/lib/share-store'

type TripOption = { id: string; title: string; startDate: string | null; endDate: string | null }

/** Ekran po „Udostępnij → Planer”: podgląd, wybór wyjazdu, notatka, do skrzynki. */
export function ShareScreen({ trips }: { trips: TripOption[] }) {
  const router = useRouter()
  const params = useSearchParams()
  const [share, setShare] = useState<PendingShare | null | undefined>(undefined)
  const [tripId, setTripId] = useState(trips[0]?.id ?? '')
  const [note, setNote] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'queued'>('idle')

  // Najnowsze udostępnienie z service workera; bez SW — z parametrów adresu.
  useEffect(() => {
    const fromQuery = ['title', 'text', 'url'].some((k) => params.get(k))
    if (fromQuery) {
      setShare({
        id: 'query',
        title: params.get('title') ?? undefined,
        text: params.get('text') ?? undefined,
        url: params.get('url') ?? undefined,
        files: [],
        createdAt: Date.now(),
      })
      return
    }
    void shareStore
      .all('pending')
      .then((all) => setShare(all.sort((a, b) => b.createdAt - a.createdAt)[0] ?? null))
      .catch(() => setShare(null))
  }, [params])

  const preview = share ? parseShared(share) : undefined

  const submit = async () => {
    if (!share || !tripId) return
    setState('sending')
    await shareStore.put('outbox', {
      clientKey: randomId(),
      tripId,
      title: share.title,
      text: share.text,
      url: share.url,
      note: note.trim() || undefined,
      createdAt: Date.now(),
    })
    if (share.id !== 'query') await shareStore.delete('pending', share.id)
    await flushOutbox()
    const left = await shareStore.all('outbox')
    if (left.length) setState('queued')
    else router.replace(`/trips/${tripId}/inbox`)
  }

  const cancel = async () => {
    if (share && share.id !== 'query') await shareStore.delete('pending', share.id)
    router.replace('/')
  }

  if (share === undefined) return null

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-1">
      <TopBar title="udostępnij do planera" />

      {!share ? (
        <p className="island p-4 text-sm text-muted">● nie ma nic do dodania</p>
      ) : (
        <>
          <section className="island flex gap-3 p-4">
            <MapPin className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden="true" />
            <div className="min-w-0">
              <p className="font-bold">{preview?.name ?? 'miejsce z linku'}</p>
              {preview?.address && <p className="text-xs text-subtle italic">{preview.address}</p>}
              {(preview?.mapsUrl ?? preview?.otherUrl) && (
                <p className="mt-1 truncate text-xs text-teal">
                  {preview?.mapsUrl ?? preview?.otherUrl}
                </p>
              )}
              {share.files.length > 0 && (
                <p className="mt-2 flex items-center gap-1 text-xs text-subtle italic">
                  <Paperclip className="size-3.5" aria-hidden="true" />
                  {share.files.length} {share.files.length === 1 ? 'plik' : 'pliki'} — import zdjęć
                  i PDF-ów w etapie 7
                </p>
              )}
            </div>
          </section>

          {state === 'queued' ? (
            <div className="island p-4 text-sm">
              <p>
                <span className="text-green">●</span> zapisane na telefonie — trafi do skrzynki, gdy
                wróci zasięg
              </p>
              <button
                type="button"
                onClick={() => router.replace(`/trips/${tripId}/list`)}
                className={buttonClass('island', 'mt-3 w-full')}
              >
                przejdź do wyjazdu
              </button>
            </div>
          ) : (
            <>
              <SectionLabel>wyjazd</SectionLabel>
              {trips.length === 0 && (
                <p className="island p-4 text-sm text-muted">● najpierw utwórz wyjazd</p>
              )}
              <div role="radiogroup" aria-label="wyjazd" className="flex flex-col gap-1">
                {trips.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="radio"
                    aria-checked={tripId === t.id}
                    onClick={() => setTripId(t.id)}
                    className={cx(
                      'island flex min-h-14 items-center gap-3 px-4 text-left transition-colors',
                      tripId === t.id && 'border-accent',
                    )}
                  >
                    <span
                      className={cx(
                        'size-3 shrink-0 rounded-full border-2',
                        tripId === t.id ? 'border-accent bg-accent' : 'border-dim',
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold">{t.title}</span>
                      <span className="text-xs text-subtle italic">
                        {formatDateSpan(t.startDate, t.endDate)}
                      </span>
                    </span>
                  </button>
                ))}
              </div>

              <div className="island mt-1 p-4">
                <Field label="notatka (opcjonalnie)">
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={2}
                    maxLength={1000}
                    placeholder="np. polecała Ola, rezerwować z wyprzedzeniem"
                    className={cx(inputClass, 'py-2')}
                  />
                </Field>
              </div>

              <div className="mt-1 grid grid-cols-2 gap-1">
                <button type="button" onClick={cancel} className={buttonClass('island')}>
                  anuluj
                </button>
                <button
                  type="button"
                  onClick={submit}
                  disabled={!tripId || state === 'sending'}
                  className={buttonClass('primary')}
                >
                  {state === 'sending' ? 'dodaję…' : 'dodaj do skrzynki'}
                </button>
              </div>
            </>
          )}
        </>
      )}
    </main>
  )
}

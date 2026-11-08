'use client'

import { formatSize, type LatLng } from '@planer/core'
import { CloudDownload, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { askConfirm } from '@/components/confirm-dialog'
import { buttonClass } from '@/components/ui'
import {
  clearOfflineMap,
  downloadOfflineMap,
  estimate,
  type OfflineMapInfo,
  readOfflineMap,
} from '@/lib/offline-map'
import { useCards, useTrip } from '@/lib/yjs/trip-doc'

/** Mapa offline w ustawieniach wyjazdu: szacunek, pobieranie z postępem, aktualizacja i usunięcie. */
export function OfflineMapPanel() {
  const { trip, ready } = useTrip()
  const cards = useCards()
  const places = useMemo(() => {
    const out: LatLng[] = []
    for (const c of cards) {
      if (c.deletedAt) continue
      for (const p of [c.location, c.destination])
        if (p?.lat !== undefined && p.lng !== undefined) out.push({ lat: p.lat, lng: p.lng })
    }
    return out
  }, [cards])
  const size = useMemo(() => estimate(places), [places])
  const [info, setInfo] = useState<OfflineMapInfo | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState<string>()
  const abort = useRef<AbortController | null>(null)
  useEffect(() => setInfo(readOfflineMap(trip.id)), [trip.id])
  useEffect(() => () => abort.current?.abort(), [])

  const download = async () => {
    setError(undefined)
    abort.current = new AbortController()
    setProgress({ done: 0, total: 0 })
    try {
      setInfo(
        await downloadOfflineMap(
          trip.id,
          places,
          (done, total) => setProgress({ done, total }),
          abort.current.signal,
        ),
      )
    } catch (e) {
      if ((e as Error).name !== 'AbortError')
        setError(navigator.onLine ? 'pobieranie przerwane — spróbuj jeszcze raz' : 'brak zasięgu')
    } finally {
      setProgress(null)
    }
  }

  const remove = async () => {
    const ok = await askConfirm({
      title: 'usunąć mapę offline?',
      body: 'Bez zasięgu mapa pokaże tylko to, co było ostatnio oglądane.',
      confirm: 'usuń',
      danger: true,
    })
    if (!ok) return
    await clearOfflineMap(trip.id)
    setInfo(null)
  }

  // Nowe miejsca od czasu pobrania: wystarczy pobrać jeszcze raz (zapisane pliki są pomijane).
  const stale = info && info.places !== places.length

  return (
    <section id="mapa" className="island mt-1 flex scroll-mt-2 flex-col gap-2 p-4 text-sm">
      <p className="font-bold">mapa offline</p>
      {!ready ? (
        <p className="text-xs text-subtle italic">wczytuję plan…</p>
      ) : !places.length ? (
        <p className="text-xs text-subtle italic">● karty nie mają jeszcze miejsc na mapie</p>
      ) : (
        <>
          <p className="text-xs text-subtle italic">
            zarys okolicy miast i szczegóły ulic w promieniu ok. 1 km od {places.length}{' '}
            {places.length === 1 ? 'miejsca' : 'miejsc'} · ok. {size.tiles} kafelków, ~{size.mb} MB
          </p>
          {info && (
            <p className="text-xs">
              <span className="text-green">•</span> pobrana{' '}
              {new Date(info.at).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' })} ·{' '}
              {formatSize(info.bytes)}
              {stale && <span className="text-amber"> · są nowe miejsca, pobierz jeszcze raz</span>}
            </p>
          )}
          {progress ? (
            <div className="flex flex-col gap-1">
              <div className="h-1 overflow-hidden rounded-full bg-raised" aria-hidden="true">
                <div
                  className="h-full rounded-full bg-accent transition-[width]"
                  style={{
                    width: `${progress.total ? (progress.done / progress.total) * 100 : 2}%`,
                  }}
                />
              </div>
              <p
                className="flex items-center justify-between text-xs text-subtle"
                aria-live="polite"
              >
                {progress.total ? `${progress.done} z ${progress.total} plików` : 'przygotowuję…'}
                <button
                  type="button"
                  onClick={() => abort.current?.abort()}
                  className="min-h-11 px-2 text-accent"
                >
                  przerwij
                </button>
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-[1fr_auto] gap-1">
              <button
                type="button"
                onClick={() => void download()}
                className={buttonClass(info && !stale ? 'island' : 'primary')}
              >
                <CloudDownload className="size-4" aria-hidden="true" />
                {info ? 'pobierz jeszcze raz' : 'pobierz mapę'}
              </button>
              {info && (
                <button
                  type="button"
                  onClick={() => void remove()}
                  aria-label="usuń mapę offline"
                  className={buttonClass('danger', 'px-3')}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </button>
              )}
            </div>
          )}
          {error && <p className="text-xs text-red">● {error}</p>}
        </>
      )}
    </section>
  )
}

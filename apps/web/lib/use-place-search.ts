'use client'

import { hasCoords, mainCluster, type PlaceHit } from '@planer/core'
import { useEffect, useMemo, useState } from 'react'
import { useCards, useTrip } from '@/lib/yjs/trip-doc'

const DEBOUNCE_MS = 350
const MIN_CHARS = 3

export type PlaceSearch = {
  hits: PlaceHit[]
  state: 'idle' | 'searching' | 'done' | 'offline'
}

/**
 * Podpowiedzi miejsc dla wpisanego tekstu (Photon przez `/api/places/search`), przesunięte w stronę
 * okolicy wyjazdu: środek największego skupiska miejsc z kart, a bez nich miejsce z nazwy wyjazdu
 * (liczy serwer). Pusty `query` czyści podpowiedzi.
 */
export function usePlaceSearch(query: string): PlaceSearch {
  const { trip } = useTrip()
  const cards = useCards()
  const near = useMemo(() => {
    const points = mainCluster(cards.filter((c) => !c.deletedAt && hasCoords(c)).map(placeOf))
    if (!points.length) return undefined
    const lat = points.reduce((s, p) => s + p.lat, 0) / points.length
    const lng = points.reduce((s, p) => s + p.lng, 0) / points.length
    return `${lat.toFixed(3)},${lng.toFixed(3)}`
  }, [cards])
  const [result, setResult] = useState<PlaceSearch>({ hits: [], state: 'idle' })
  const q = query.trim()

  useEffect(() => {
    if (q.length < MIN_CHARS) {
      setResult({ hits: [], state: 'idle' })
      return
    }
    const abort = new AbortController()
    setResult((r) => ({ ...r, state: 'searching' }))
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ q, tripId: trip.id, ...(near && { at: near }) })
      fetch(`/api/places/search?${params}`, { signal: abort.signal })
        .then((res) => (res.ok ? res.json() : { places: [] }))
        .then((body: { places?: PlaceHit[] }) =>
          setResult({ hits: body.places ?? [], state: 'done' }),
        )
        .catch(() => {
          if (!abort.signal.aborted) setResult({ hits: [], state: 'offline' })
        })
    }, DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      abort.abort()
    }
  }, [q, near, trip.id])

  return result
}

function placeOf(card: { location?: { lat?: number; lng?: number } }) {
  return { lat: card.location?.lat as number, lng: card.location?.lng as number }
}

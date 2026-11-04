'use client'

import { type DayGap, TRAVEL_BUFFER_MIN } from '@planer/core'
import { useState } from 'react'
import type { Route } from '@/app/api/route/route'
import { useTrip } from '@/lib/yjs/trip-doc'

export type TravelCheck = { minutes: number; mode: 'pieszo' | 'komunikacją'; late: number }

/**
 * Dojazdy między kartami dnia, sprawdzane na żądanie. Warunki Google nie pozwalają zapisywać czasów
 * z Routes API, więc wynik żyje tylko w stanie komponentu — po wyjściu z ekranu znika.
 */
export function useDayTravel(date: string, gaps: DayGap[]) {
  const { trip } = useTrip()
  const [checks, setChecks] = useState<Map<string, TravelCheck | null>>(new Map())
  const [state, setState] = useState<'idle' | 'busy' | 'error' | 'limit'>('idle')

  const check = async () => {
    setState('busy')
    let limited = false
    const entries = await Promise.all(
      gaps.flatMap((gap) => {
        const route = gap.route
        if (!route || gap.freeMin < 0) return []
        const at = (p: { lat: number; lng: number }) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`
        return [
          (async () => {
            const [transit, walk] = await Promise.all([
              fetch('/api/route/transit', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ tripId: trip.id, ...route, date, time: gap.leaveAt }),
              }).then((r) => {
                if (r.status === 429) limited = true
                return r.ok ? (r.json() as Promise<{ minutes: number | null }>) : null
              }),
              fetch(`/api/route?from=${at(route.from)}&to=${at(route.to)}`)
                .then((r) => (r.ok ? (r.json() as Promise<Route>) : null))
                .catch(() => null),
            ])
            const options = [
              walk?.foot && { minutes: walk.foot.minutes, mode: 'pieszo' as const },
              transit?.minutes != null && {
                minutes: transit.minutes,
                mode: 'komunikacją' as const,
              },
            ].filter((o) => !!o)
            const best = options.sort((a, b) => a.minutes - b.minutes)[0]
            const result: TravelCheck | null = best
              ? { ...best, late: best.minutes + TRAVEL_BUFFER_MIN - gap.freeMin }
              : null
            return [gap.from, result] as const
          })(),
        ]
      }),
    ).catch(() => null)
    if (!entries) {
      setState('error')
      return
    }
    setChecks(new Map(entries))
    setState(limited ? 'limit' : 'idle')
  }

  return { checks, state, check }
}

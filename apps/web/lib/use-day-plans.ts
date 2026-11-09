'use client'

import { dayLegs, type LegPlan, todayLocal, withoutFarWalks } from '@planer/core'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PlanResponse } from '@/app/api/route/plan/route'
import { useCards, useTrip } from '@/lib/yjs/trip-doc'

const DEBOUNCE_MS = 700
/** Po powrocie do aplikacji w dniu odcinków: pytamy serwer, gdy ostatni wynik jest starszy. */
const STALE_MS = 15 * 60_000

/**
 * Plany odcinków dnia, pobierane same: od razu ostatni wynik z telefonu (działa offline), w tle
 * świeży z serwera. Zmiana godziny czy miejsca zmienia podpis odcinków i pobiera tylko raz na zmianę.
 * Serwer i tak bierze z bazy to, co już policzone.
 */
export function useDayPlans(date: string | null) {
  const { trip } = useTrip()
  const cards = useCards()
  const legs = useMemo(() => (date ? dayLegs(cards, date) : []), [cards, date])
  const [plans, setPlans] = useState<Record<string, LegPlan | null>>({})
  const [limited, setLimited] = useState(false)
  const [early, setEarly] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const loadedAt = useRef(0)

  const requests = useMemo(
    () =>
      legs.flatMap((l) =>
        l.route
          ? [{ id: l.id, ...l.route, leaveAt: l.leaveAt, arriveBy: l.arriveBy, mode: l.mode }]
          : [],
      ),
    [legs],
  )
  const signature = JSON.stringify(requests)
  const storageKey = `planer-legs:${trip.id}:${date}`
  const latest = useRef(requests)
  latest.current = requests

  const load = useCallback(
    async (refresh = false) => {
      if (!date || !latest.current.length || !navigator.onLine) return
      setBusy(true)
      const res = await fetch('/api/route/plan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tripId: trip.id, date, refresh, legs: latest.current }),
      }).catch(() => null)
      const body = res?.ok ? ((await res.json()) as PlanResponse) : null
      setBusy(false)
      if (!body) return
      loadedAt.current = Date.now()
      setPlans(body.plans)
      setLimited(body.limited)
      setEarly(body.early ?? [])
      try {
        localStorage.setItem(storageKey, JSON.stringify(body.plans))
      } catch {}
    },
    [date, trip.id, storageKey],
  )

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) setPlans(withoutFarWalks(JSON.parse(saved), trip.travelMode))
    } catch {}
  }, [storageKey, trip.travelMode])

  useEffect(() => {
    // Minione dni nie potrzebują nowych wyników; zostaje to, co telefon już ma.
    if (!date || date < todayLocal() || signature === '[]') return
    const timer = setTimeout(() => void load(), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [signature, date, load])

  // W trasie telefon długo leży w kieszeni: po powrocie do aplikacji sprawdzamy rozkład jeszcze raz.
  // Serwer i tak odda wynik z bazy, jeśli jest dość świeży.
  useEffect(() => {
    if (!date || date !== todayLocal()) return
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - loadedAt.current > STALE_MS)
        void load()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [date, load])

  return { legs, plans, limited, early, busy, refresh: () => void load(true) }
}

'use client'

import { useEffect, useState } from 'react'
import { useTrip } from '@/lib/yjs/trip-doc'

export type TripNow = { date: string; time: string }

/** Data i godzina w strefie wyjazdu; Temporal nie działa jeszcze w przeglądarkach. */
function clockIn(timeZone: string): TripNow {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date())
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}`,
  }
}

/** Godziny kart są lokalne dla miejsca wyjazdu, więc „teraz” też. Odświeża się co minutę. */
export function useTripNow(): TripNow | null {
  const { trip } = useTrip()
  const [now, setNow] = useState<TripNow | null>(null)
  useEffect(() => {
    const tick = () => setNow(clockIn(trip.timezone))
    tick()
    const timer = setInterval(tick, 60_000)
    return () => clearInterval(timer)
  }, [trip.timezone])
  return now
}

'use client'

import { type RateLookup, todayLocal } from '@planer/core'
import { useEffect, useMemo, useState } from 'react'

// Kursy NBP po stronie klienta: pamięć w module + localStorage (sumy działają też offline,
// po kursach z ostatniego połączenia). Klucz `EUR|2027-07-14`.

const STORAGE = 'planer-fx-v1'
const memory = new Map<string, number>()
const requested = new Set<string>()

function loadStored() {
  if (memory.size) return
  try {
    for (const [k, v] of Object.entries(JSON.parse(localStorage.getItem(STORAGE) ?? '{}'))) {
      if (typeof v === 'number') memory.set(k, v)
    }
  } catch {}
}

function store() {
  try {
    localStorage.setItem(STORAGE, JSON.stringify(Object.fromEntries(memory)))
  } catch {}
}

/** Dzień, dla którego bierzemy kurs: data karty albo dziś (przyszłość i brak daty). */
export function rateDate(date: string | undefined, today = todayLocal()): string {
  return date && date <= today ? date : today
}

export function useRates(pairs: { currency: string; date: string }[]): RateLookup {
  const [version, setVersion] = useState(0)
  const keys = useMemo(
    () =>
      [
        ...new Set(pairs.filter((p) => p.currency !== 'PLN').map((p) => `${p.currency}|${p.date}`)),
      ].sort(),
    [pairs],
  )
  const keyString = keys.join(',')

  useEffect(() => {
    loadStored()
    const missing = keyString.split(',').filter((k) => k && !memory.has(k) && !requested.has(k))
    if (!missing.length) {
      setVersion((v) => v + 1)
      return
    }
    for (const k of missing) requested.add(k)
    const q = missing.map((k) => k.replace('|', ':')).join(',')
    void fetch(`/api/fx?q=${q}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { rates: Record<string, number> } | null) => {
        for (const [k, v] of Object.entries(body?.rates ?? {})) memory.set(k, v)
        store()
        setVersion((v) => v + 1)
      })
      .catch(() => {
        for (const k of missing) requested.delete(k) // spróbujemy przy następnym renderze z siecią
      })
  }, [keyString])

  // `version` rośnie po każdym dociągnięciu kursów — nowa funkcja = ponowne przeliczenie sum.
  return useMemo<RateLookup>(() => (currency, date) => memory.get(`${currency}|${date}`), [version])
}

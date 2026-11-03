'use client'

import { useEffect, useState } from 'react'

/**
 * GET z pamięcią w localStorage: od razu ostatnia znana odpowiedź (także offline), w tle świeża.
 * Tylko dla wygody jednego urządzenia (pogoda, dojazd) — nic, co musi być wspólne.
 */
export function useFetchCached<T>(url: string | null, maxAgeMs: number): T | undefined {
  const key = url && `planer-cache:${url}`
  const [data, setData] = useState<T | undefined>(undefined)

  useEffect(() => {
    if (!url || !key) {
      setData(undefined)
      return
    }
    let stale = true
    try {
      const raw = localStorage.getItem(key)
      if (raw) {
        const { at, value } = JSON.parse(raw) as { at: number; value: T }
        setData(value)
        stale = Date.now() - at > maxAgeMs
      } else setData(undefined)
    } catch {}
    if (!stale || !navigator.onLine) return
    let cancelled = false
    void fetch(url)
      .then((r) => (r.ok ? (r.json() as Promise<T>) : undefined))
      .then((value) => {
        if (cancelled || value === undefined) return
        setData(value)
        try {
          localStorage.setItem(key, JSON.stringify({ at: Date.now(), value }))
        } catch {}
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [url, key, maxAgeMs])

  return data
}

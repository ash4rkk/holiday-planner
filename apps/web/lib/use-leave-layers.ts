'use client'

import { useCallback, useEffect, useState } from 'react'
import { DEFAULT_LAYERS, type Layers } from '@/components/leave/model'

// Co widać w planerze urlopów (święta PL/BB, wyjazdy, kalendarze) — osobno na każdym urządzeniu.

const KEY = 'planer:leave-layers'

function read(): Layers {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULT_LAYERS
    const v = JSON.parse(raw) as Partial<Layers>
    return {
      pl: v.pl !== false,
      bb: v.bb !== false,
      trips: v.trips !== false,
      hiddenCalendars: Array.isArray(v.hiddenCalendars)
        ? v.hiddenCalendars.filter((x) => typeof x === 'string')
        : [],
    }
  } catch {
    return DEFAULT_LAYERS
  }
}

export function useLeaveLayers(): [Layers, (change: Partial<Layers>) => void] {
  const [layers, setLayers] = useState<Layers>(DEFAULT_LAYERS)
  useEffect(() => setLayers(read()), [])
  const update = useCallback((change: Partial<Layers>) => {
    setLayers((prev) => {
      const next = { ...prev, ...change }
      try {
        localStorage.setItem(KEY, JSON.stringify(next))
      } catch {}
      return next
    })
  }, [])
  return [layers, update]
}

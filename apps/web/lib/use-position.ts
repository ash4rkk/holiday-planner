'use client'

import type { LatLng } from '@planer/core'
import { useCallback, useEffect, useState } from 'react'

/**
 * Bieżąca pozycja: automatycznie tylko przy już udzielonej zgodzie (bez pytania przy otwarciu Pulpitu);
 * `request()` pyta o zgodę na wyraźne życzenie.
 */
export function usePosition(): { position?: LatLng; request: () => void; denied: boolean } {
  const [position, setPosition] = useState<LatLng>()
  const [denied, setDenied] = useState(false)

  const request = useCallback(() => {
    navigator.geolocation?.getCurrentPosition(
      (p) => setPosition({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => setDenied(true),
      { enableHighAccuracy: false, maximumAge: 5 * 60_000, timeout: 10_000 },
    )
  }, [])

  useEffect(() => {
    void navigator.permissions
      ?.query({ name: 'geolocation' })
      .then((state) => {
        if (state.state === 'granted') request()
        if (state.state === 'denied') setDenied(true)
      })
      .catch(() => {})
  }, [request])

  return { position, request, denied }
}

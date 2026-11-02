'use client'

import 'maplibre-gl/dist/maplibre-gl.css'
import { navigationUrl } from '@planer/core'
import { useEffect, useRef } from 'react'
import { cx } from '@/components/ui'
import { useMapStyle } from './map-style'
import { loadMapLibre } from './maplibre'

/** Mała, nieruchoma mapka z pinezką; dotknięcie otwiera nawigację w Google Maps. */
export function MiniMap({
  lat,
  lng,
  className,
  colorVar = '--accent',
}: {
  lat: number
  lng: number
  className?: string
  colorVar?: string
}) {
  const container = useRef<HTMLDivElement>(null)
  const style = useMapStyle()

  useEffect(() => {
    let map: import('maplibre-gl').Map | undefined
    let cancelled = false
    void loadMapLibre().then(({ Map, Marker }) => {
      if (cancelled || !container.current) return
      map = new Map({
        container: container.current,
        style,
        center: [lng, lat],
        zoom: 15,
        interactive: false,
        attributionControl: false,
      })
      const pin = document.createElement('div')
      pin.className = 'map-pin'
      pin.style.setProperty('--pin', `var(${colorVar})`)
      pin.append(Object.assign(document.createElement('div'), { className: 'map-pin__shape' }))
      new Marker({ element: pin, anchor: 'bottom' }).setLngLat([lng, lat]).addTo(map)
    })
    return () => {
      cancelled = true
      map?.remove()
    }
  }, [lat, lng, style, colorVar])

  return (
    <a
      href={navigationUrl({ lat, lng })}
      target="_blank"
      rel="noreferrer"
      aria-label="nawiguj do tego miejsca"
      className={cx(
        'relative block h-32 overflow-hidden rounded-small border border-line bg-raised',
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-0">
        <div ref={container} className="size-full" />
      </div>
    </a>
  )
}

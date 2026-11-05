'use client'

import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useRef } from 'react'
import { themeMap, useMapStyle } from '@/components/map/map-style'
import { loadMapLibre } from '@/components/map/maplibre'

export type PublicPin = { lat: number; lng: number; title: string; colorVar: string; label: string }

/** Mapa do linku publicznego: pinezki wszystkich miejsc, dotknięcie pokazuje nazwę. */
export function PublicMap({ pins }: { pins: PublicPin[] }) {
  const container = useRef<HTMLDivElement>(null)
  const style = useMapStyle()

  useEffect(() => {
    let map: import('maplibre-gl').Map | undefined
    let cancelled = false
    void loadMapLibre().then(({ Map, Marker, Popup, LngLatBounds }) => {
      if (cancelled || !container.current || !pins.length) return
      map = new Map({
        container: container.current,
        style,
        center: [pins[0]?.lng ?? 0, pins[0]?.lat ?? 0],
        zoom: 12,
        attributionControl: { compact: true },
        dragRotate: false,
      })
      themeMap(map)
      const bounds = new LngLatBounds()
      for (const pin of pins) {
        const el = document.createElement('div')
        el.className = 'map-pin'
        el.style.setProperty('--pin', `var(${pin.colorVar})`)
        el.append(Object.assign(document.createElement('div'), { className: 'map-pin__shape' }))
        new Marker({ element: el, anchor: 'bottom' })
          .setLngLat([pin.lng, pin.lat])
          .setPopup(
            new Popup({ offset: 24, closeButton: false }).setText(`${pin.title} · ${pin.label}`),
          )
          .addTo(map)
        bounds.extend([pin.lng, pin.lat])
      }
      map.fitBounds(bounds, { padding: 40, maxZoom: 15, duration: 0 })
    })
    return () => {
      cancelled = true
      map?.remove()
    }
  }, [pins, style])

  if (!pins.length) return null
  return (
    <div className="island h-72 overflow-hidden">
      <div ref={container} className="size-full" />
    </div>
  )
}

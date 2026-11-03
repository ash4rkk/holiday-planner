'use client'

import {
  addDays,
  type CardSnapshot,
  hasCoords,
  type LatLng,
  staysOver,
  todayLocal,
} from '@planer/core'
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  type LucideIcon,
  Sun,
} from 'lucide-react'
import type { Weather } from '@/app/api/weather/route'
import { cx } from '@/components/ui'
import { useFetchCached } from '@/lib/use-fetch-cached'

/** Kody pogody WMO (Open-Meteo) → ikona i opis. */
export function weatherIcon(code: number): { icon: LucideIcon; label: string } {
  if (code === 0) return { icon: Sun, label: 'słonecznie' }
  if (code <= 2) return { icon: CloudSun, label: 'częściowe zachmurzenie' }
  if (code === 3) return { icon: Cloud, label: 'pochmurno' }
  if (code <= 48) return { icon: CloudFog, label: 'mgła' }
  if (code <= 57) return { icon: CloudDrizzle, label: 'mżawka' }
  if (code <= 67 || (code >= 80 && code <= 82)) return { icon: CloudRain, label: 'deszcz' }
  if (code <= 77 || code === 85 || code === 86) return { icon: CloudSnow, label: 'śnieg' }
  return { icon: CloudLightning, label: 'burza' }
}

export function useWeather(at: LatLng | undefined): Weather | undefined {
  const url = at ? `/api/weather?at=${at.lat.toFixed(2)},${at.lng.toFixed(2)}` : null
  return useFetchCached<Weather>(url, 3 * 60 * 60_000)
}

/** Miejsce dla pogody danego dnia: nocleg tej nocy, pierwsze miejsce dnia, jakiekolwiek miejsce wyjazdu. */
export function weatherPlace(cards: CardSnapshot[], date: string): LatLng | undefined {
  const live = cards.filter((c) => !c.deletedAt).filter(hasCoords)
  const pick =
    live.find((c) => staysOver(c, date)) ??
    live.find((c) => c.date === date) ??
    live.find((c) => c.type === 'stay') ??
    live[0]
  return pick ? { lat: pick.location.lat, lng: pick.location.lng } : undefined
}

/** Ikona i temperatura przy nagłówku dnia w Liście (Open-Meteo: do 16 dni naprzód). */
export function DayWeather({
  date,
  cards,
  className,
}: {
  date: string
  cards: CardSnapshot[]
  className?: string
}) {
  const today = todayLocal()
  const inRange = date >= today && date <= addDays(today, 15)
  const weather = useWeather(inRange ? weatherPlace(cards, date) : undefined)
  const day = weather?.daily.find((d) => d.date === date)
  if (!day) return null
  const { icon: Icon, label } = weatherIcon(day.code)
  return (
    <span className={cx('flex items-center gap-1 text-xs text-muted', className)} title={label}>
      <Icon className="size-3.5" aria-hidden="true" />
      {Math.round(day.max)}°<span className="text-dim">/{Math.round(day.min)}°</span>
      <span className="sr-only">{label}</span>
    </span>
  )
}

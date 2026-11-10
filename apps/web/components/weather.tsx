'use client'

import {
  addDays,
  type CardSnapshot,
  cardSkies,
  cardsInRain,
  type DemoWeatherDay,
  demoDaily,
  demoHourly,
  formatDayHeader,
  isStormCode,
  isWetHour,
  type LatLng,
  rainSpans,
  type Sky,
  todayLocal,
  weatherPlace,
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
  Umbrella,
} from 'lucide-react'
import { useMemo } from 'react'
import type { HourlyWeather } from '@/app/api/weather/hourly/route'
import type { Weather } from '@/app/api/weather/route'
import { askChat } from '@/components/ai/chat-panel'
import { CardSky } from '@/components/sky/card-sky'
import { cx } from '@/components/ui'
import { useFetchCached } from '@/lib/use-fetch-cached'
import { useDemoWeather } from '@/lib/yjs/trip-doc'

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

/** `demo` dla widoków poza wyjazdem (lista wyjazdów); w wyjeździe bierze go z kontekstu. */
export function useWeather(at: LatLng | undefined, demo?: DemoWeatherDay[]): Weather | undefined {
  const ctxDemo = useDemoWeather()
  const fake = demo ?? ctxDemo
  const url = at && !fake ? `/api/weather?at=${at.lat.toFixed(2)},${at.lng.toFixed(2)}` : null
  const fetched = useFetchCached<Weather>(url, 3 * 60 * 60_000)
  const shown = useMemo(() => (fake ? demoDaily(fake) : undefined), [fake])
  return fake ? (at ? shown : undefined) : fetched
}

/** Prognoza godzinowa miejsca (albo pogoda na pokaz przykładowego wyjazdu). */
function useHourly(at: LatLng | undefined): HourlyWeather | undefined {
  const fake = useDemoWeather()
  const url =
    at && !fake ? `/api/weather/hourly?at=${at.lat.toFixed(2)},${at.lng.toFixed(2)}` : null
  const fetched = useFetchCached<HourlyWeather>(url, 60 * 60_000)
  const shown = useMemo(() => (fake ? demoHourly(fake) : undefined), [fake])
  return fake ? (at ? shown : undefined) : fetched
}

/** Ikona i temperatura dnia: Lista i obrys dnia na Tablicy (Open-Meteo: 7 dni wstecz, 16 naprzód). */
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
  const inRange = date >= addDays(today, -7) && date <= addDays(today, 15)
  const weather = useWeather(inRange ? weatherPlace(cards, date) : undefined)
  const day = weather?.daily.find((d) => d.date === date)
  if (!day) return null
  const { icon: Icon, label } = weatherIcon(day.code)
  return (
    <span className={cx('flex items-center gap-1 text-xs text-muted', className)} title={label}>
      <Icon className="size-3.5" aria-hidden="true" />
      {Math.round(day.max)}°<span className="text-subtle">/{Math.round(day.min)}°</span>
      <span className="sr-only">{label}</span>
    </span>
  )
}

/** Godziny deszczu w dniu (prognoza godzinowa, 7 dni od dziś); poza zasięgiem prognozy — pusto. */
export function useRainHours(date: string, cards: CardSnapshot[]): string[] {
  const today = todayLocal()
  const inRange = date >= today && date <= addDays(today, 6)
  const at = inRange ? weatherPlace(cards, date) : undefined
  const hourly = useHourly(at)
  return useMemo(
    () =>
      (hourly?.hours ?? [])
        // Nocny deszcz nie przeszkadza planowi dnia.
        .filter((h) => h.time.startsWith(date) && isWetHour(h.rain, h.mm))
        .map((h) => h.time.slice(11, 13))
        .filter((hour) => Number(hour) >= 6 && Number(hour) <= 23),
    [hourly, date],
  )
}

/**
 * Niebo nad kartami dnia (deszcz / burza) do animacji tła kart. Ta sama prognoza godzinowa co
 * „plan B?” (jeden adres, więc jedno zapytanie); poza zasięgiem 7 dni — pusta mapa.
 */
export function useDaySkies(date: string | undefined, cards: CardSnapshot[]): Map<string, Sky> {
  const today = todayLocal()
  const inRange = Boolean(date && date >= today && date <= addDays(today, 6))
  const at = inRange && date ? weatherPlace(cards, date) : undefined
  const hourly = useHourly(at)
  return useMemo(() => {
    if (!date || !hourly) return new Map<string, Sky>()
    const hours = hourly.hours
      .filter((h) => h.time.startsWith(date))
      .map((h) => ({
        hour: Number(h.time.slice(11, 13)),
        wet: isWetHour(h.rain, h.mm),
        storm: isStormCode(h.code),
      }))
    return cardSkies(cards, date, hours)
  }, [hourly, date, cards])
}

/** Tło karty w deszczu albo burzy (scena na canvasie); rodzic ma `relative isolate overflow-hidden`. */
export function SkyLayer({ sky }: { sky: Sky | undefined }) {
  return sky ? <CardSky kind={sky} /> : null
}

/**
 * „Plan B?” przy dniu, gdy deszcz wypada w godzinach kart. Dopiero dotknięcie pyta AI — ono ocenia,
 * które karty są pod gołym niebem, i proponuje zamienniki pod dachem jako warianty.
 */
export function RainPlanB({
  date,
  cards,
  className,
}: {
  date: string
  cards: CardSnapshot[]
  className?: string
}) {
  const hours = useRainHours(date, cards)
  const wet = cardsInRain(cards, date, hours)
  if (!wet.length) return null
  const spans = rainSpans(hours)
  return (
    <button
      type="button"
      onClick={() =>
        askChat(
          `plan B na deszcz: ${formatDayHeader(date)} (${date}), deszcz ${spans}; karty w tych godzinach: ${wet.map((c) => `${c.time} ${c.title || 'bez tytułu'}`).join(', ')}`,
        )
      }
      title={`deszcz ${spans} — zapytaj o plan B`}
      className={cx(
        'hit flex min-h-7 shrink-0 items-center gap-1 rounded-full border border-blue/40 px-2 text-xs text-blue hover:bg-blue/10',
        className,
      )}
    >
      <Umbrella className="size-3.5" aria-hidden="true" />
      plan B?
    </button>
  )
}

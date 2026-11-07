import { logEvent } from '@planer/core/events'
import { memoCache, parseLatLng } from '@/lib/memo-cache'

export type HourlyWeather = {
  /** Godziny w strefie miejsca, `2026-11-12T14:00`. */
  hours: { time: string; temp: number; code: number; rain: number; mm: number }[]
  days: {
    date: string
    code: number
    max: number
    min: number
    rain: number
    wind: number
    sunrise: string
    sunset: string
  }[]
}

const cache = memoCache<HourlyWeather>(60 * 60_000)

/**
 * Szczegółowa pogoda (Open-Meteo, bez klucza) — godzina po godzinie na 7 dni od dziś. Dalsze dni
 * strona pogody bierze z dziennej prognozy (`/api/weather`), więc to jedno zapytanie na miejsce i godzinę.
 */
export async function GET(request: Request) {
  const at = parseLatLng(new URL(request.url).searchParams.get('at'))
  if (!at) return Response.json({ error: 'brak współrzędnych' }, { status: 400 })
  const key = `${at.lat.toFixed(2)},${at.lng.toFixed(2)}`
  try {
    const weather = await cache(key, async () => {
      const url = new URL('https://api.open-meteo.com/v1/forecast')
      url.search = new URLSearchParams({
        latitude: at.lat.toFixed(2),
        longitude: at.lng.toFixed(2),
        hourly: 'temperature_2m,weather_code,precipitation_probability,precipitation',
        daily:
          'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,sunrise,sunset',
        timezone: 'auto',
        forecast_days: '7',
      }).toString()
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
      if (!res.ok) throw new Error(`open-meteo ${res.status}`)
      const b = (await res.json()) as {
        hourly: {
          time: string[]
          temperature_2m: number[]
          weather_code: number[]
          precipitation_probability: (number | null)[]
          precipitation: (number | null)[]
        }
        daily: {
          time: string[]
          weather_code: number[]
          temperature_2m_max: number[]
          temperature_2m_min: number[]
          precipitation_probability_max: (number | null)[]
          wind_speed_10m_max: number[]
          sunrise: string[]
          sunset: string[]
        }
      }
      return {
        hours: b.hourly.time.map((time, i) => ({
          time,
          temp: b.hourly.temperature_2m[i] ?? 0,
          code: b.hourly.weather_code[i] ?? 0,
          rain: b.hourly.precipitation_probability[i] ?? 0,
          mm: b.hourly.precipitation[i] ?? 0,
        })),
        days: b.daily.time.map((date, i) => ({
          date,
          code: b.daily.weather_code[i] ?? 0,
          max: b.daily.temperature_2m_max[i] ?? 0,
          min: b.daily.temperature_2m_min[i] ?? 0,
          rain: b.daily.precipitation_probability_max[i] ?? 0,
          wind: b.daily.wind_speed_10m_max[i] ?? 0,
          sunrise: (b.daily.sunrise[i] ?? '').slice(11, 16),
          sunset: (b.daily.sunset[i] ?? '').slice(11, 16),
        })),
      }
    })
    return Response.json(weather, { headers: { 'cache-control': 'private, max-age=3600' } })
  } catch (error) {
    void logEvent('warn', 'pogoda', `Open-Meteo: ${String(error)}`)
    return Response.json({ error: String(error) }, { status: 502 })
  }
}

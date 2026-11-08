import { type DayForecast, isWetHour } from './briefing'
import type { LatLng } from './maps'

// Prognoza jednego dnia z Open-Meteo (bez klucza) — dla workera (wieczorne podsumowanie).

export async function dayForecast(at: LatLng, date: string): Promise<DayForecast | undefined> {
  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.search = new URLSearchParams({
    latitude: at.lat.toFixed(2),
    longitude: at.lng.toFixed(2),
    hourly: 'precipitation_probability,precipitation',
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    timezone: 'auto',
    start_date: date,
    end_date: date,
  }).toString()
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) }).catch(() => null)
  if (!res?.ok) return undefined
  const b = (await res.json()) as {
    hourly: { time: string[]; precipitation_probability: number[]; precipitation: number[] }
    daily: {
      temperature_2m_max: number[]
      temperature_2m_min: number[]
      precipitation_probability_max: number[]
    }
  }
  // Deszcz w godzinach dnia (7–22): prawdopodobny albo z opadem.
  const rainHours = b.hourly.time
    .map((t, i) => ({
      hour: t.slice(11, 13),
      wet: isWetHour(b.hourly.precipitation_probability[i] ?? 0, b.hourly.precipitation[i] ?? 0),
    }))
    .filter((h) => h.wet && Number(h.hour) >= 7 && Number(h.hour) <= 22)
    .map((h) => h.hour)
  return {
    max: b.daily.temperature_2m_max[0] ?? 0,
    min: b.daily.temperature_2m_min[0] ?? 0,
    rain: b.daily.precipitation_probability_max[0] ?? 0,
    rainHours,
  }
}

import { memoCache, parseLatLng } from '@/lib/memo-cache'

export type Weather = {
  current?: { temp: number; code: number }
  daily: { date: string; code: number; max: number; min: number }[]
}

const cache = memoCache<Weather>(30 * 60_000)

/** Pogoda z Open-Meteo (bez klucza): teraz, 7 dni wstecz i 16 naprzód, dni w strefie miejsca. */
export async function GET(request: Request) {
  const at = parseLatLng(new URL(request.url).searchParams.get('at'))
  if (!at) return Response.json({ error: 'brak współrzędnych' }, { status: 400 })
  // ~1 km dokładności wystarczy i łączy zapytania z okolicy.
  const key = `${at.lat.toFixed(2)},${at.lng.toFixed(2)}`
  try {
    const weather = await cache(key, async () => {
      const url = new URL('https://api.open-meteo.com/v1/forecast')
      url.search = new URLSearchParams({
        latitude: at.lat.toFixed(2),
        longitude: at.lng.toFixed(2),
        current: 'temperature_2m,weather_code',
        daily: 'weather_code,temperature_2m_max,temperature_2m_min',
        timezone: 'auto',
        past_days: '7',
        forecast_days: '16',
      }).toString()
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
      if (!res.ok) throw new Error(`open-meteo ${res.status}`)
      const b = (await res.json()) as {
        current?: { temperature_2m: number; weather_code: number }
        daily: {
          time: string[]
          weather_code: number[]
          temperature_2m_max: number[]
          temperature_2m_min: number[]
        }
      }
      return {
        current: b.current && { temp: b.current.temperature_2m, code: b.current.weather_code },
        daily: b.daily.time.map((date, i) => ({
          date,
          code: b.daily.weather_code[i] ?? 0,
          max: b.daily.temperature_2m_max[i] ?? 0,
          min: b.daily.temperature_2m_min[i] ?? 0,
        })),
      }
    })
    return Response.json(weather, { headers: { 'cache-control': 'private, max-age=1800' } })
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 502 })
  }
}

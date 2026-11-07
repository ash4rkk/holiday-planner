import { daysBetween, isIsoDate } from '@planer/core'
import { logEvent } from '@planer/core/events'
import { memoCache, parseLatLng } from '@/lib/memo-cache'

export type NormalWeather = {
  /** Średnia z tych samych dni w ostatnich latach — na dni, dla których nie ma jeszcze prognozy. */
  days: { date: string; max: number; min: number; rainy: number }[]
  years: number
}

const YEARS = 3
const MAX_DAYS = 60
const cache = memoCache<NormalWeather>(7 * 24 * 60 * 60_000)

/** Ten sam dzień i miesiąc `back` lat wcześniej (29 lutego → 28). */
function yearsBack(date: string, back: number): string {
  const year = Number(date.slice(0, 4)) - back
  const md = date.slice(5) === '02-29' ? '02-28' : date.slice(5)
  return `${year}-${md}`
}

/**
 * Pogoda orientacyjna (Open-Meteo, archiwum): średnie maks./min. i odsetek dni z opadem z tych
 * samych dat w ostatnich latach. Liczy się rzadko — wynik w pamięci na tydzień.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const at = parseLatLng(params.get('at'))
  const from = params.get('from') ?? ''
  const to = params.get('to') ?? ''
  if (!at || !isIsoDate(from) || !isIsoDate(to) || to < from || daysBetween(from, to) > MAX_DAYS)
    return Response.json({ error: 'złe parametry' }, { status: 400 })
  const key = `${at.lat.toFixed(1)},${at.lng.toFixed(1)}|${from}|${to}`
  try {
    const normal = await cache(key, async () => {
      const years = await Promise.all(
        Array.from({ length: YEARS }, async (_, i) => {
          const url = new URL('https://archive-api.open-meteo.com/v1/archive')
          url.search = new URLSearchParams({
            latitude: at.lat.toFixed(1),
            longitude: at.lng.toFixed(1),
            start_date: yearsBack(from, i + 1),
            end_date: yearsBack(to, i + 1),
            daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum',
            timezone: 'auto',
          }).toString()
          const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
          if (!res.ok) throw new Error(`open-meteo archive ${res.status}`)
          const b = (await res.json()) as {
            daily: {
              temperature_2m_max: (number | null)[]
              temperature_2m_min: (number | null)[]
              precipitation_sum: (number | null)[]
            }
          }
          return b.daily
        }),
      )
      const count = daysBetween(from, to) + 1
      const avg = (values: (number | null | undefined)[]) => {
        const ok = values.filter((v): v is number => typeof v === 'number')
        return ok.length ? ok.reduce((a, b) => a + b, 0) / ok.length : 0
      }
      const days = Array.from({ length: count }, (_, i) => {
        const date = new Date(Date.parse(`${from}T12:00:00Z`) + i * 86_400_000)
          .toISOString()
          .slice(0, 10)
        return {
          date,
          max: avg(years.map((y) => y.temperature_2m_max[i])),
          min: avg(years.map((y) => y.temperature_2m_min[i])),
          rainy:
            years.filter((y) => (y.precipitation_sum[i] ?? 0) >= 1).length /
            Math.max(1, years.length),
        }
      })
      return { days, years: YEARS }
    })
    return Response.json(normal, { headers: { 'cache-control': 'private, max-age=86400' } })
  } catch (error) {
    void logEvent('warn', 'pogoda', `Open-Meteo: ${String(error)}`)
    return Response.json({ error: String(error) }, { status: 502 })
  }
}

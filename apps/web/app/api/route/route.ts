import { memoCache, parseLatLng } from '@/lib/memo-cache'

export type Leg = { minutes: number; km: number }
export type Route = { foot?: Leg; car?: Leg }

const cache = memoCache<Route>(10 * 60_000)

async function leg(profile: 'foot' | 'car', from: string, to: string): Promise<Leg | undefined> {
  // Serwery OSRM FOSSGIS (OpenStreetMap DE) mają osobne profile pieszy i samochodowy.
  const url = `https://routing.openstreetmap.de/routed-${profile}/route/v1/${profile}/${from};${to}?overview=false`
  const res = await fetch(url, {
    signal: AbortSignal.timeout(8000),
    headers: { 'user-agent': 'Planer/1.0' },
  })
  if (!res.ok) return undefined
  const body = (await res.json()) as {
    code: string
    routes?: { duration: number; distance: number }[]
  }
  const r = body.code === 'Ok' ? body.routes?.[0] : undefined
  return r
    ? { minutes: Math.round(r.duration / 60), km: Math.round(r.distance / 100) / 10 }
    : undefined
}

/** Czas dojazdu pieszo i autem między dwoma punktami (?from=lat,lng&to=lat,lng). */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const from = parseLatLng(params.get('from'))
  const to = parseLatLng(params.get('to'))
  if (!from || !to) return Response.json({ error: 'brak współrzędnych' }, { status: 400 })
  // OSRM chce lng,lat; zaokrąglenie do ~10 m łączy zapytania z tego samego miejsca.
  const a = `${from.lng.toFixed(4)},${from.lat.toFixed(4)}`
  const b = `${to.lng.toFixed(4)},${to.lat.toFixed(4)}`
  try {
    const route = await cache(`${a};${b}`, async () => {
      const [foot, car] = await Promise.all([
        leg('foot', a, b).catch(() => undefined),
        leg('car', a, b).catch(() => undefined),
      ])
      return { foot, car }
    })
    return Response.json(route, { headers: { 'cache-control': 'private, max-age=600' } })
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 502 })
  }
}

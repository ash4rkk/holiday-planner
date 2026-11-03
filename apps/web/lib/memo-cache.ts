import 'server-only'

/** Prosta pamięć w procesie z czasem życia — dla odpowiedzi zewnętrznych API (pogoda, trasy). */
export function memoCache<T>(ttlMs: number, max = 500) {
  const entries = new Map<string, { at: number; value: Promise<T> }>()
  return async (key: string, load: () => Promise<T>): Promise<T> => {
    const hit = entries.get(key)
    if (hit && Date.now() - hit.at < ttlMs) return hit.value
    const value = load()
    entries.set(key, { at: Date.now(), value })
    if (entries.size > max) entries.delete(entries.keys().next().value as string)
    // Błąd nie zostaje w pamięci — następne zapytanie spróbuje od nowa.
    value.catch(() => entries.delete(key))
    return value
  }
}

export function parseLatLng(value: string | null): { lat: number; lng: number } | undefined {
  const m = value?.match(/^(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)$/)
  if (!m) return undefined
  const lat = Number(m[1])
  const lng = Number(m[2])
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : undefined
}

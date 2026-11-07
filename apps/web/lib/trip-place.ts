import 'server-only'
import type { LatLng } from '@planer/core'
import type { Trip } from '@planer/core/db'
import { countryName } from '@/components/trips/flag'
import { geocode } from '@/lib/maps-resolve'
import { memoCache } from '@/lib/memo-cache'

const cache = memoCache<LatLng | undefined>(30 * 24 * 60 * 60_000)

/**
 * Miejsce wyjazdu z nazwy i kraju („Budapeszt, Węgry”) — dla pogody, zanim karty mają miejsca.
 * Nawiasy z nazwy pomijamy („Lizbona (przykład)” → „Lizbona”).
 */
export async function tripPlace(
  trip: Pick<Trip, 'title' | 'country'>,
): Promise<LatLng | undefined> {
  const name = trip.title.replace(/\(.*?\)/g, '').trim()
  if (!name) return undefined
  const query = [name, countryName(trip.country)].filter(Boolean).join(', ')
  return cache(query.toLowerCase(), () => geocode(query)).catch(() => undefined)
}

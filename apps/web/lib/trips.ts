import 'server-only'
import { todayLocal } from '@planer/core'
import { desc, eq, getDb, sql, type Trip, trips } from '@planer/core/db'
import { cache } from 'react'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const getTrip = cache(async (id: string): Promise<Trip | undefined> => {
  if (!UUID.test(id)) return undefined
  const [trip] = await getDb().select().from(trips).where(eq(trips.id, id))
  return trip
})

export type TripLists = { current: Trip[]; upcoming: Trip[]; past: Trip[]; archived: Trip[] }

/** Wyjazdy pogrupowane względem dzisiejszej daty (bez dat = nadchodzące). */
export const listTrips = cache(async (today = todayLocal()): Promise<TripLists> => {
  const all = await getDb()
    .select()
    .from(trips)
    .orderBy(sql`${trips.startDate} asc nulls last`, desc(trips.createdAt))
  const lists: TripLists = { current: [], upcoming: [], past: [], archived: [] }
  for (const trip of all) {
    if (trip.archived) lists.archived.push(trip)
    else if (!trip.startDate || trip.startDate > today) lists.upcoming.push(trip)
    else if ((trip.endDate ?? trip.startDate) >= today) lists.current.push(trip)
    else lists.past.push(trip)
  }
  lists.past.reverse()
  lists.archived.reverse()
  return lists
})

/** Wyjazd, do którego prowadzi dolne menu poza ekranami wyjazdu: trwający, najbliższy, ostatni. */
export async function defaultTrip(): Promise<Trip | undefined> {
  const { current, upcoming, past } = await listTrips()
  return current[0] ?? upcoming[0] ?? past[0]
}

export async function insertTrip(values: typeof trips.$inferInsert): Promise<Trip> {
  const [trip] = await getDb().insert(trips).values(values).returning()
  if (!trip) throw new Error('Nie udało się zapisać wyjazdu')
  return trip
}

export async function patchTrip(id: string, values: Partial<typeof trips.$inferInsert>) {
  await getDb().update(trips).set(values).where(eq(trips.id, id))
}

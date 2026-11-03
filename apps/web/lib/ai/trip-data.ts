import 'server-only'
import { attachmentsOf, tripContext } from '@planer/core'
import type { Trip } from '@planer/core/db'
import { eq, getDb, tripDocs } from '@planer/core/db'
import { getRates } from '@planer/core/fx'
import * as Y from 'yjs'

/** Ostatni zapisany stan dokumentu wyjazdu (serwer sync zapisuje go co kilka sekund). */
export async function loadTripDoc(tripId: string): Promise<Y.Doc> {
  const doc = new Y.Doc()
  const [row] = await getDb()
    .select({ state: tripDocs.state })
    .from(tripDocs)
    .where(eq(tripDocs.tripId, tripId))
  if (row) Y.applyUpdate(doc, row.state)
  return doc
}

export async function tripContextFor(trip: Trip, doc: Y.Doc): Promise<string> {
  const today = Temporal.Now.plainDateISO('Europe/Warsaw').toString()
  const raw = await getRates(
    trip.currencies.map((currency) => ({ currency, date: today })),
    today,
  ).catch(() => ({}))
  const rates = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k.split('|')[0], v]))
  return tripContext(doc, { ...trip, timezone: trip.timezone }, rates)
}

/** Czy załącznik należy do tego wyjazdu (model nie może odczytać cudzych plików). */
export function attachmentInDoc(doc: Y.Doc, id: string): boolean {
  return attachmentsOf(doc).has(id)
}

/** „wtorek, 3 listopada 2026, 20:15” w strefie wyjazdu — do wiadomości, nie do promptu systemowego. */
export function nowInTrip(timezone: string): string {
  const now = Temporal.Now.zonedDateTimeISO(timezone)
  const date = new Intl.DateTimeFormat('pl-PL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: timezone,
  }).format(new Date())
  return `${date}, ${String(now.hour).padStart(2, '0')}:${String(now.minute).padStart(2, '0')} (${timezone})`
}

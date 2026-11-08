import { readPacking } from '@planer/core'
import { desc, eq, getDb, ne, tripDocs, trips } from '@planer/core/db'
import * as Y from 'yjs'
import { getCurrentUser } from '@/lib/auth/user'

/** Listy pakowania z innych wyjazdów (najnowsze najpierw) — do skopiowania jako punkt wyjścia. */
export async function GET(request: Request) {
  await getCurrentUser()
  const tripId = new URL(request.url).searchParams.get('tripId') ?? ''
  const rows = await getDb()
    .select({ id: trips.id, title: trips.title, startDate: trips.startDate, state: tripDocs.state })
    .from(tripDocs)
    .innerJoin(trips, eq(trips.id, tripDocs.tripId))
    .where(ne(trips.id, tripId))
    .orderBy(desc(trips.startDate))
  const sources = rows.flatMap(({ id, title, startDate, state }) => {
    const doc = new Y.Doc()
    Y.applyUpdate(doc, state)
    const items = readPacking(doc)
    doc.destroy()
    return items.length ? [{ tripId: id, title, startDate, items }] : []
  })
  return Response.json({ sources })
}

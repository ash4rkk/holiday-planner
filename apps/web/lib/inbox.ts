import 'server-only'
import { and, count, desc, eq, getDb, type InboxItem, inboxItems, isNull } from '@planer/core/db'
import type { ResolvedPlace } from './maps-resolve'

export async function listInbox(tripId: string): Promise<InboxItem[]> {
  return getDb()
    .select()
    .from(inboxItems)
    .where(and(eq(inboxItems.tripId, tripId), isNull(inboxItems.usedAt)))
    .orderBy(desc(inboxItems.createdAt))
}

export async function countInbox(tripId: string): Promise<number> {
  const [row] = await getDb()
    .select({ n: count() })
    .from(inboxItems)
    .where(and(eq(inboxItems.tripId, tripId), isNull(inboxItems.usedAt)))
  return row?.n ?? 0
}

/** Dodaje miejsce; ten sam clientKey (ponowienie z kolejki offline) zwraca istniejący wpis. */
export async function addToInbox(values: {
  tripId: string
  place: ResolvedPlace
  note?: string
  createdBy: string
  clientKey?: string
}): Promise<InboxItem> {
  const { place } = values
  const [created] = await getDb()
    .insert(inboxItems)
    .values({
      tripId: values.tripId,
      name: place.name,
      address: place.address,
      lat: place.lat,
      lng: place.lng,
      mapsUrl: place.mapsUrl ?? place.otherUrl,
      note: values.note || null,
      createdBy: values.createdBy,
      clientKey: values.clientKey,
    })
    .onConflictDoNothing({ target: inboxItems.clientKey })
    .returning()
  if (created) return created
  const [existing] = await getDb()
    .select()
    .from(inboxItems)
    .where(eq(inboxItems.clientKey, values.clientKey ?? ''))
  if (!existing) throw new Error('Nie udało się zapisać miejsca')
  return existing
}

export async function markInboxUsed(id: string, tripId: string) {
  await getDb()
    .update(inboxItems)
    .set({ usedAt: new Date() })
    .where(and(eq(inboxItems.id, id), eq(inboxItems.tripId, tripId)))
}

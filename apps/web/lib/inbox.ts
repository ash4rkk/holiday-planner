import 'server-only'
import { and, eq, getDb, type InboxItem, inboxItems, isNull } from '@planer/core/db'
import type { ResolvedPlace } from './maps-resolve'

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

/**
 * Odbiór udostępnionych miejsc wyjazdu: oznacza je jako użyte i zwraca w jednym zapytaniu, więc
 * przy dwóch otwartych telefonach każde miejsce dostaje tylko jeden (bez podwójnych kart).
 */
export async function claimInbox(tripId: string): Promise<InboxItem[]> {
  return getDb()
    .update(inboxItems)
    .set({ usedAt: new Date() })
    .where(and(eq(inboxItems.tripId, tripId), isNull(inboxItems.usedAt)))
    .returning()
}

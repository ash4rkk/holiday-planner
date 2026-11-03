import 'server-only'
import { randomBytes } from 'node:crypto'
import { and, eq, getDb, isNull, shareLinks, type Trip, trips } from '@planer/core/db'

/** Aktywny link wyjazdu (najwyżej jeden). */
export async function activeShareLink(tripId: string): Promise<string | undefined> {
  const [row] = await getDb()
    .select({ token: shareLinks.token })
    .from(shareLinks)
    .where(and(eq(shareLinks.tripId, tripId), isNull(shareLinks.revokedAt)))
  return row?.token
}

/** Nowy link: 32 bajty losowe (base64url) — nie do zgadnięcia. Poprzedni przestaje działać. */
export async function createShareLink(tripId: string, userId: string): Promise<string> {
  const token = randomBytes(32).toString('base64url')
  const db = getDb()
  await db.transaction(async (tx) => {
    await tx
      .update(shareLinks)
      .set({ revokedAt: new Date() })
      .where(and(eq(shareLinks.tripId, tripId), isNull(shareLinks.revokedAt)))
    await tx.insert(shareLinks).values({ token, tripId, createdBy: userId })
  })
  return token
}

export async function revokeShareLinks(tripId: string) {
  await getDb()
    .update(shareLinks)
    .set({ revokedAt: new Date() })
    .where(and(eq(shareLinks.tripId, tripId), isNull(shareLinks.revokedAt)))
}

export async function tripForToken(token: string): Promise<Trip | undefined> {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return undefined
  const [row] = await getDb()
    .select({ trip: trips })
    .from(shareLinks)
    .innerJoin(trips, eq(trips.id, shareLinks.tripId))
    .where(and(eq(shareLinks.token, token), isNull(shareLinks.revokedAt)))
  return row?.trip
}

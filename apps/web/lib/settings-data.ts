import 'server-only'
import { readCards } from '@planer/core'
import { and, desc, eq, getDb, isNull, shareLinks, trips, users } from '@planer/core/db'
import { computeReminders, type ReminderDefaults } from '@planer/core/reminders'
import { replaceReminders } from '@planer/core/reminders-db'
import { loadTripDoc } from '@/lib/ai/trip-data'

/** Aktywne linki dla rodziny ze wszystkich wyjazdów, od najnowszych. */
export async function activeFamilyLinks() {
  return getDb()
    .select({
      token: shareLinks.token,
      createdAt: shareLinks.createdAt,
      tripId: trips.id,
      tripTitle: trips.title,
      startDate: trips.startDate,
      endDate: trips.endDate,
      createdBy: users.name,
    })
    .from(shareLinks)
    .innerJoin(trips, eq(trips.id, shareLinks.tripId))
    .leftJoin(users, eq(users.id, shareLinks.createdBy))
    .where(isNull(shareLinks.revokedAt))
    .orderBy(desc(shareLinks.createdAt))
}

export async function revokeFamilyLinkByToken(token: string) {
  await getDb()
    .update(shareLinks)
    .set({ revokedAt: new Date() })
    .where(and(eq(shareLinks.token, token), isNull(shareLinks.revokedAt)))
}

/**
 * Po zmianie domyślnych przypomnień przelicza je od razu dla wszystkich wyjazdów (z zapisanego
 * stanu dokumentów); sync i tak przeliczy je przy następnej zmianie karty.
 */
export async function recomputeAllReminders(defaults: ReminderDefaults) {
  const all = await getDb()
    .select({ id: trips.id, title: trips.title, timezone: trips.timezone })
    .from(trips)
  for (const trip of all) {
    const doc = await loadTripDoc(trip.id)
    await replaceReminders(
      trip.id,
      computeReminders(readCards(doc), trip.title, trip.timezone, defaults),
    )
  }
}

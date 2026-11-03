import { and, eq, gt, isNull, lte } from 'drizzle-orm'
import { getDb, reminders, trips } from './db'
import type { ReminderRow } from './reminders'

/**
 * Zapisuje przypomnienia wyjazdu wyliczone z dokumentu: niewysłane, których już nie ma (zmieniona
 * godzina, usunięta karta), znikają; wysłane zostają, żeby nie wysłać drugi raz tego samego.
 */
export async function replaceReminders(tripId: string, rows: ReminderRow[]) {
  const db = getDb()
  await db.transaction(async (tx) => {
    await tx.delete(reminders).where(and(eq(reminders.tripId, tripId), isNull(reminders.sentAt)))
    if (rows.length) {
      await tx
        .insert(reminders)
        .values(
          rows.map((r) => ({
            tripId,
            cardId: r.cardId,
            fireAt: r.fireAt,
            title: r.title,
            body: r.body,
          })),
        )
        .onConflictDoNothing()
    }
  })
}

/** Przypomnienia do wysłania teraz; starsze niż 2 h (np. serwer leżał) przepadają po cichu. */
export async function dueReminders(now = new Date()) {
  return getDb()
    .select({
      tripId: reminders.tripId,
      cardId: reminders.cardId,
      fireAt: reminders.fireAt,
      title: reminders.title,
      body: reminders.body,
    })
    .from(reminders)
    .innerJoin(trips, eq(trips.id, reminders.tripId))
    .where(
      and(
        isNull(reminders.sentAt),
        lte(reminders.fireAt, now),
        gt(reminders.fireAt, new Date(now.getTime() - 2 * 60 * 60_000)),
      ),
    )
}

export async function markReminderSent(r: { tripId: string; cardId: string; fireAt: Date }) {
  await getDb()
    .update(reminders)
    .set({ sentAt: new Date() })
    .where(
      and(
        eq(reminders.tripId, r.tripId),
        eq(reminders.cardId, r.cardId),
        eq(reminders.fireAt, r.fireAt),
      ),
    )
}

/** Ponowienie po nieudanej wysyłce: przypomnienie wraca do kolejki (w oknie 2 h od terminu). */
export async function unmarkReminderSent(r: { tripId: string; cardId: string; fireAt: Date }) {
  await getDb()
    .update(reminders)
    .set({ sentAt: null })
    .where(
      and(
        eq(reminders.tripId, r.tripId),
        eq(reminders.cardId, r.cardId),
        eq(reminders.fireAt, r.fireAt),
      ),
    )
}

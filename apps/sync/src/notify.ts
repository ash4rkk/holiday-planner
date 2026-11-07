import { readCards } from '@planer/core'
import { eq, getDb, trips, users } from '@planer/core/db'
import { logEvent } from '@planer/core/events'
import { sendPush } from '@planer/core/push'
import { cardsDigest, changedTitles, changesBody, computeReminders } from '@planer/core/reminders'
import { replaceReminders } from '@planer/core/reminders-db'
import { getReminderDefaults } from '@planer/core/settings'
import type * as Y from 'yjs'

// Skutki zmian dokumentu wyjazdu po stronie serwera: przeliczenie przypomnień push i powiadomienie
// drugiej osoby o zmianach (zbiorczo, po chwili ciszy).

const REMINDERS_DEBOUNCE_MS = 5_000
const CHANGES_QUIET_MS = Number(process.env.CHANGES_QUIET_MS ?? 3 * 60_000)

async function tripInfo(tripId: string) {
  const [trip] = await getDb()
    .select({ title: trips.title, timezone: trips.timezone })
    .from(trips)
    .where(eq(trips.id, tripId))
  return trip
}

const reminderTimers = new Map<string, ReturnType<typeof setTimeout>>()

/** Przelicza przypomnienia wyjazdu z dokumentu (z opóźnieniem, żeby nie pisać przy każdym znaku). */
export function scheduleReminders(tripId: string, doc: Y.Doc) {
  clearTimeout(reminderTimers.get(tripId))
  reminderTimers.set(
    tripId,
    setTimeout(() => {
      reminderTimers.delete(tripId)
      void (async () => {
        const trip = await tripInfo(tripId)
        if (!trip) return
        await replaceReminders(
          tripId,
          computeReminders(readCards(doc), trip.title, trip.timezone, await getReminderDefaults()),
        )
      })().catch((e) => logEvent('warn', 'sync', `przypomnienia: ${String(e)}`))
    }, REMINDERS_DEBOUNCE_MS),
  )
}

// Stan dokumentu po ostatniej zmianie (odcisk kart) i oczekujące powiadomienia per osoba.
const digests = new Map<string, Map<string, string>>()
const pending = new Map<
  string,
  { before: Map<string, string>; timer: ReturnType<typeof setTimeout> }
>()

export function rememberDigest(tripId: string, doc: Y.Doc) {
  digests.set(tripId, cardsDigest(readCards(doc)))
}

/**
 * Zmiana od `email`: zapamiętuje stan sprzed pierwszej zmiany w serii, a po CHANGES_QUIET_MS ciszy
 * wysyła drugiej osobie listę zmienionych kart — chyba że ma ten wyjazd właśnie otwarty.
 */
export function trackChange(
  tripId: string,
  doc: Y.Doc,
  email: string,
  connectedEmails: () => string[],
) {
  const previous = digests.get(tripId) ?? new Map()
  rememberDigest(tripId, doc)
  const key = `${tripId}|${email}`
  const existing = pending.get(key)
  if (existing) clearTimeout(existing.timer)
  const before = existing?.before ?? previous
  pending.set(key, {
    before,
    timer: setTimeout(() => {
      pending.delete(key)
      void flush(tripId, doc, email, before, connectedEmails()).catch((e) =>
        logEvent('warn', 'sync', `powiadomienie o zmianach: ${String(e)}`),
      )
    }, CHANGES_QUIET_MS),
  })
}

async function flush(
  tripId: string,
  doc: Y.Doc,
  email: string,
  before: Map<string, string>,
  connected: string[],
) {
  const cards = readCards(doc)
  const titles = changedTitles(before, cardsDigest(cards), cards)
  if (!titles.length) return
  const trip = await tripInfo(tripId)
  if (!trip) return
  const db = getDb()
  const [author] = await db.select({ name: users.name }).from(users).where(eq(users.email, email))
  // Kto ma wyjazd otwarty, widzi zmiany na żywo — jemu push niepotrzebny.
  const recipients = await db.select({ id: users.id, email: users.email }).from(users)
  const userIds = recipients
    .filter((u) => u.email !== email && !connected.includes(u.email))
    .map((u) => u.id)
  if (!userIds.length) return
  await sendPush(
    { userIds, only: 'changes' },
    {
      title: `${author?.name ?? email} zmienia plan · ${trip.title}`,
      body: changesBody(titles),
      url: `/trips/${tripId}/list`,
      tag: `changes-${tripId}`,
    },
  )
}

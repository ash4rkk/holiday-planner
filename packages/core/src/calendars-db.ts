import type { EventOccurrence } from './calendar-events'
import { todayLocal } from './dates'
import { calendarEvents, calendars, eq, getDb } from './db'
import { logEvent } from './events'
import { importWindow } from './ics'
import { timetreeClient, timetreeConfigured, timetreeOccurrences } from './timetree'

// Kalendarze zewnętrzne w bazie. Tylko serwer (web, worker).

const CHUNK = 500

/** Zastępuje wszystkie wydarzenia kalendarza nowymi (w transakcji: widok nigdy nie jest pusty). */
export async function replaceCalendarEvents(
  calendarId: string,
  events: EventOccurrence[],
): Promise<void> {
  await getDb().transaction(async (tx) => {
    await tx.delete(calendarEvents).where(eq(calendarEvents.calendarId, calendarId))
    for (let i = 0; i < events.length; i += CHUNK) {
      await tx
        .insert(calendarEvents)
        .values(events.slice(i, i + CHUNK).map((e) => ({ ...e, calendarId })))
        .onConflictDoNothing()
    }
    await tx
      .update(calendars)
      .set({ lastSyncAt: new Date(), lastError: null })
      .where(eq(calendars.id, calendarId))
  })
}

/** Pobiera wydarzenia jednego kalendarza TimeTree i zapisuje je; błąd trafia do `last_error`. */
export async function syncTimetreeCalendar(calendar: {
  id: string
  name: string
  externalId: string | null
}): Promise<number> {
  try {
    if (!calendar.externalId) throw new Error('brak id kalendarza TimeTree')
    const raw = await timetreeClient().events(calendar.externalId)
    const { events, truncated } = timetreeOccurrences(raw, importWindow(todayLocal()))
    await replaceCalendarEvents(calendar.id, events)
    if (truncated)
      await logEvent('warn', 'timetree', `${calendar.name}: za dużo wydarzeń, część pominięta`)
    return events.length
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await getDb().update(calendars).set({ lastError: message }).where(eq(calendars.id, calendar.id))
    await logEvent('error', 'timetree', `${calendar.name}: ${message}`)
    return -1
  }
}

/** Sync wszystkich kalendarzy TimeTree (worker, co godzinę). */
export async function syncAllTimetree(): Promise<void> {
  if (!timetreeConfigured()) return
  const list = await getDb().select().from(calendars).where(eq(calendars.source, 'timetree'))
  for (const cal of list) await syncTimetreeCalendar(cal)
}

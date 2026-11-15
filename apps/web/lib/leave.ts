import 'server-only'
import type { DayEvent } from '@planer/core'
import {
  and,
  asc,
  type Calendar,
  calendarEvents,
  calendars,
  eq,
  getDb,
  gte,
  inArray,
  type LeavePeriod,
  leavePeriods,
  lte,
} from '@planer/core/db'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isUuid = (id: unknown): id is string => typeof id === 'string' && UUID.test(id)

/** Okresy urlopu, które zahaczają o zakres dat (włącznie). */
export async function listLeave(from: string, to: string): Promise<LeavePeriod[]> {
  return getDb()
    .select()
    .from(leavePeriods)
    .where(and(lte(leavePeriods.startDate, to), gte(leavePeriods.endDate, from)))
    .orderBy(asc(leavePeriods.startDate))
}

export async function insertLeave(values: typeof leavePeriods.$inferInsert): Promise<LeavePeriod> {
  const [row] = await getDb().insert(leavePeriods).values(values).returning()
  if (!row) throw new Error('Nie udało się zapisać urlopu')
  return row
}

export async function patchLeave(
  id: string,
  values: Partial<typeof leavePeriods.$inferInsert>,
): Promise<LeavePeriod | undefined> {
  const [row] = await getDb()
    .update(leavePeriods)
    .set(values)
    .where(eq(leavePeriods.id, id))
    .returning()
  return row
}

export async function removeLeave(id: string): Promise<LeavePeriod | undefined> {
  const [row] = await getDb().delete(leavePeriods).where(eq(leavePeriods.id, id)).returning()
  return row
}

export async function listCalendars(): Promise<Calendar[]> {
  return getDb().select().from(calendars).orderBy(asc(calendars.createdAt))
}

/** Wydarzenia ze wszystkich kalendarzy zahaczające o zakres dat. */
export async function listCalendarEvents(from: string, to: string): Promise<DayEvent[]> {
  return getDb()
    .select({
      calendarId: calendarEvents.calendarId,
      uid: calendarEvents.uid,
      title: calendarEvents.title,
      startDate: calendarEvents.startDate,
      endDate: calendarEvents.endDate,
      startTime: calendarEvents.startTime,
      endTime: calendarEvents.endTime,
      allDay: calendarEvents.allDay,
      color: calendarEvents.color,
    })
    .from(calendarEvents)
    .where(and(lte(calendarEvents.startDate, to), gte(calendarEvents.endDate, from)))
    .orderBy(asc(calendarEvents.startDate))
}

/** Malowanie i jego „cofnij”: usuwa okresy i zapisuje nowe w jednej transakcji. */
export async function swapLeave(
  removeIds: string[],
  insert: (typeof leavePeriods.$inferInsert)[],
): Promise<LeavePeriod[]> {
  return getDb().transaction(async (tx) => {
    if (removeIds.length) await tx.delete(leavePeriods).where(inArray(leavePeriods.id, removeIds))
    return insert.length ? tx.insert(leavePeriods).values(insert).returning() : []
  })
}

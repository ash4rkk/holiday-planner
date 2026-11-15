'use server'

import { HOLIDAY_REGIONS, type HolidayRegion } from '@planer/core'
import { syncTimetreeCalendar } from '@planer/core/calendars-db'
import { calendars, eq, getDb } from '@planer/core/db'
import { setLeaveRegion } from '@planer/core/settings'
import { revalidatePath } from 'next/cache'
import { getCurrentUser } from '@/lib/auth/user'
import { isUuid } from '@/lib/leave'

const refresh = () => {
  revalidatePath('/leave')
  revalidatePath('/trips')
  revalidatePath('/settings', 'layout')
}

export async function saveLeaveRegion(form: FormData) {
  await getCurrentUser()
  const region = String(form.get('region'))
  if (HOLIDAY_REGIONS.includes(region as HolidayRegion))
    await setLeaveRegion(region as HolidayRegion)
  refresh()
}

/** Dodaje kalendarz TimeTree (id z listy konta) i od razu pobiera wydarzenia. */
export async function addTimetreeCalendar(form: FormData) {
  await getCurrentUser()
  const externalId = String(form.get('externalId') ?? '').trim()
  const name =
    String(form.get('name') ?? '')
      .trim()
      .slice(0, 80) || 'TimeTree'
  if (!/^[\w-]{1,64}$/.test(externalId)) return
  const [cal] = await getDb()
    .insert(calendars)
    .values({ name, source: 'timetree', externalId })
    .returning()
  if (cal) await syncTimetreeCalendar(cal)
  refresh()
}

export async function syncCalendarNow(id: string) {
  await getCurrentUser()
  if (!isUuid(id)) return
  const [cal] = await getDb().select().from(calendars).where(eq(calendars.id, id))
  if (cal?.source === 'timetree') await syncTimetreeCalendar(cal)
  refresh()
}

export async function renameCalendar(id: string, name: string) {
  await getCurrentUser()
  const clean = name.trim().slice(0, 80)
  if (!isUuid(id) || !clean) return
  await getDb().update(calendars).set({ name: clean }).where(eq(calendars.id, id))
  refresh()
}

export async function deleteCalendar(id: string) {
  await getCurrentUser()
  if (!isUuid(id)) return
  await getDb().delete(calendars).where(eq(calendars.id, id))
  refresh()
}

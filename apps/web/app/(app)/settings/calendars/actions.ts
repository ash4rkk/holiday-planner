'use server'

import { HOLIDAY_REGIONS, type HolidayRegion } from '@planer/core'
import { syncTimetreeCalendar } from '@planer/core/calendars-db'
import { calendars, eq, getDb } from '@planer/core/db'
import { setLeaveRegions } from '@planer/core/settings'
import { revalidatePath } from 'next/cache'
import { getCurrentUser } from '@/lib/auth/user'
import { isUuid } from '@/lib/leave'
import { listProfiles } from '@/lib/profiles'

const refresh = () => {
  revalidatePath('/leave')
  revalidatePath('/trips')
  revalidatePath('/settings', 'layout')
}

/** Region świąt każdej osoby (pola `region:<imię>`). */
export async function saveLeaveRegion(form: FormData) {
  const user = await getCurrentUser()
  const byPerson: Record<string, HolidayRegion> = {}
  for (const { name } of listProfiles(user.name)) {
    const region = String(form.get(`region:${name}`))
    if (HOLIDAY_REGIONS.includes(region as HolidayRegion)) byPerson[name] = region as HolidayRegion
  }
  await setLeaveRegions(byPerson)
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

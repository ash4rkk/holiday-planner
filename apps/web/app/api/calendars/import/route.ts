import { todayLocal } from '@planer/core'
import { replaceCalendarEvents } from '@planer/core/calendars-db'
import { calendars, eq, getDb } from '@planer/core/db'
import { ICS_MAX_BYTES, importWindow, parseIcs } from '@planer/core/ics'
import { revalidatePath } from 'next/cache'
import { getCurrentUser } from '@/lib/auth/user'
import { isUuid } from '@/lib/leave'

/** Import pliku .ics (multipart: file, calendarId — ponowny import zastępuje wydarzenia). */
export async function POST(request: Request) {
  await getCurrentUser()
  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  const calendarId = form?.get('calendarId')
  if (!(file instanceof File) || !file.size)
    return Response.json({ error: 'brak pliku' }, { status: 400 })
  if (file.size > ICS_MAX_BYTES)
    return Response.json({ error: 'plik większy niż 5 MB' }, { status: 413 })

  let parsed: ReturnType<typeof parseIcs>
  try {
    parsed = parseIcs(await file.text(), importWindow(todayLocal()))
  } catch {
    return Response.json({ error: 'to nie jest plik kalendarza (.ics)' }, { status: 415 })
  }

  const db = getDb()
  let id: string
  if (isUuid(calendarId)) {
    const [cal] = await db.select().from(calendars).where(eq(calendars.id, calendarId))
    if (!cal || cal.source !== 'ics')
      return Response.json({ error: 'nie ma takiego kalendarza' }, { status: 404 })
    id = cal.id
  } else {
    const name = parsed.name ?? (file.name.replace(/\.ics$/i, '').trim() || 'kalendarz')
    const [cal] = await db.insert(calendars).values({ name, source: 'ics' }).returning()
    if (!cal) return Response.json({ error: 'nie udało się zapisać' }, { status: 500 })
    id = cal.id
  }
  await replaceCalendarEvents(id, parsed.events)
  revalidatePath('/leave')
  revalidatePath('/settings', 'layout')
  return Response.json({ id, count: parsed.events.length, truncated: parsed.truncated })
}

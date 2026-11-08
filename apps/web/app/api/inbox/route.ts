import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getCurrentUser } from '@/lib/auth/user'
import { addToInbox } from '@/lib/inbox'
import { resolvePlace } from '@/lib/maps-resolve'
import { getTrip } from '@/lib/trips'

const body = z.object({
  tripId: z.string(),
  title: z.string().max(500).optional(),
  text: z.string().max(4000).optional(),
  url: z.string().max(2000).optional(),
  note: z.string().max(1000).optional(),
  clientKey: z.string().max(64).optional(),
})

/** Udostępnione miejsce czeka tu na wyjazd (z ekranu /share lub z kolejki offline); otwarty wyjazd robi z niego pomysł. */
export async function POST(request: Request) {
  const user = await getCurrentUser()
  const parsed = body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'nieprawidłowe dane' }, { status: 400 })
  const { tripId, note, clientKey, ...shared } = parsed.data
  if (!(await getTrip(tripId)))
    return Response.json({ error: 'nie ma takiego wyjazdu' }, { status: 404 })
  const place = await resolvePlace(shared)
  const item = await addToInbox({ tripId, place, note, createdBy: user.id, clientKey })
  revalidatePath(`/trips/${tripId}`, 'layout')
  return Response.json(item)
}

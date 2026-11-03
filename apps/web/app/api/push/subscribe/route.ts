import { eq, getDb, pushSubscriptions } from '@planer/core/db'
import { z } from 'zod'
import { getCurrentUser } from '@/lib/auth/user'

const body = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }),
  notifyChanges: z.boolean().default(true),
})

/** Zapis subskrypcji Web Push tego urządzenia (ten sam endpoint = aktualizacja). */
export async function POST(request: Request) {
  const user = await getCurrentUser()
  const parsed = body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'nieprawidłowa subskrypcja' }, { status: 400 })
  const { endpoint, keys, notifyChanges } = parsed.data
  await getDb()
    .insert(pushSubscriptions)
    .values({ userId: user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth, notifyChanges })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { userId: user.id, p256dh: keys.p256dh, auth: keys.auth, notifyChanges },
    })
  return Response.json({ ok: true })
}

export async function DELETE(request: Request) {
  await getCurrentUser()
  const endpoint = (await request.json().catch(() => null))?.endpoint
  if (typeof endpoint === 'string')
    await getDb().delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint))
  return Response.json({ ok: true })
}

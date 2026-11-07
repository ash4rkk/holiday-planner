import { and, eq, inArray, ne } from 'drizzle-orm'
import webpush from 'web-push'
import { getDb, pushSubscriptions, users } from './db'
import { logEvent } from './events'
import { isPushEndpoint } from './push-endpoint'

// Wysyłka Web Push (VAPID) — wspólna dla workera (przypomnienia) i serwera sync (zmiany).

export type PushPayload = { title: string; body: string; url: string; tag?: string }

let configured: boolean | undefined
function configure(): boolean {
  if (configured !== undefined) return configured
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env
  configured = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY)
  if (configured)
    webpush.setVapidDetails(
      VAPID_SUBJECT || 'mailto:admin@localhost',
      VAPID_PUBLIC_KEY as string,
      VAPID_PRIVATE_KEY as string,
    )
  else console.warn('[push] brak VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY — powiadomienia wyłączone')
  return configured
}

/**
 * Wysyła do subskrypcji wybranych osób. `only: 'changes'` — tylko tym, którzy chcą powiadomień o
 * zmianach. Wygasłe subskrypcje (404/410) są usuwane. `failed` — błędy przejściowe (sieć, 5xx),
 * po których warto spróbować ponownie.
 */
export async function sendPush(
  target: { userIds?: string[]; exceptEmail?: string; only?: 'changes' },
  payload: PushPayload,
): Promise<{ sent: number; failed: number }> {
  if (!configure()) return { sent: 0, failed: 0 }
  const db = getDb()
  const conditions = [
    target.userIds ? inArray(pushSubscriptions.userId, target.userIds) : undefined,
    target.exceptEmail ? ne(users.email, target.exceptEmail) : undefined,
    target.only === 'changes' ? eq(pushSubscriptions.notifyChanges, true) : undefined,
  ].filter((c) => c !== undefined)
  const subs = await db
    .select({
      id: pushSubscriptions.id,
      endpoint: pushSubscriptions.endpoint,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
      name: users.name,
    })
    .from(pushSubscriptions)
    .innerJoin(users, eq(users.id, pushSubscriptions.userId))
    .where(conditions.length ? and(...conditions) : undefined)

  let sent = 0
  let failed = 0
  await Promise.all(
    subs.map(async (sub) => {
      if (!isPushEndpoint(sub.endpoint)) {
        console.warn('[push] pomijam subskrypcję spoza usług push')
        return
      }
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload),
          { TTL: 6 * 60 * 60, urgency: 'high', topic: payload.tag?.slice(0, 32) },
        )
        sent++
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) {
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id))
        } else {
          failed++
          await logEvent(
            'error',
            'push',
            `powiadomienie nie doszło (${sub.name}) · ${status ?? String(error)}`,
          )
        }
      }
    }),
  )
  return { sent, failed }
}

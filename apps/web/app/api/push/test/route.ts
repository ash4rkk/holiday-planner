import { sendPush } from '@planer/core/push'
import { getCurrentUser } from '@/lib/auth/user'

/** Testowe powiadomienie na wszystkie urządzenia zalogowanej osoby. */
export async function POST() {
  const user = await getCurrentUser()
  const { sent } = await sendPush(
    { userIds: [user.id] },
    { title: 'Planer', body: 'powiadomienia działają', url: '/', tag: 'test' },
  )
  return Response.json({ sent })
}

import { stopRun } from '@/lib/ai/chat-runs'
import { getCurrentUser } from '@/lib/auth/user'

/** „Stop” w czacie: przerywa trwającą odpowiedź wyjazdu; zapisuje się to, co już przyszło. */
export async function POST(request: Request) {
  await getCurrentUser()
  const { tripId } = ((await request.json().catch(() => null)) ?? {}) as { tripId?: unknown }
  if (typeof tripId !== 'string') return Response.json({ error: 'brak wyjazdu' }, { status: 400 })
  return Response.json({ stopped: stopRun(tripId) })
}

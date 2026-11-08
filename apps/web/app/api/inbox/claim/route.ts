import { getCurrentUser } from '@/lib/auth/user'
import { claimInbox } from '@/lib/inbox'
import { getTrip } from '@/lib/trips'

/** Udostępnione miejsca czekające na wyjazd — odbiera je otwarty wyjazd i robi z nich pomysły. */
export async function POST(request: Request) {
  await getCurrentUser()
  const tripId = new URL(request.url).searchParams.get('tripId') ?? ''
  if (!(await getTrip(tripId)))
    return Response.json({ error: 'nie ma takiego wyjazdu' }, { status: 404 })
  return Response.json(await claimInbox(tripId))
}

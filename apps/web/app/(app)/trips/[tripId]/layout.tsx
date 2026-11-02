import { notFound } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/user'
import { countInbox } from '@/lib/inbox'
import { getTrip } from '@/lib/trips'
import { TripProvider } from '@/lib/yjs/trip-doc'

export default async function TripLayout({ params, children }: LayoutProps<'/trips/[tripId]'>) {
  const { tripId } = await params
  const [trip, user, inboxCount] = await Promise.all([
    getTrip(tripId),
    getCurrentUser(),
    countInbox(tripId).catch(() => 0),
  ])
  if (!trip) notFound()
  const { id, title, startDate, endDate, currencies, archived } = trip
  return (
    <TripProvider
      trip={{ id, title, startDate, endDate, currencies, archived, inboxCount }}
      user={{ name: user.name, color: user.color }}
    >
      {children}
    </TripProvider>
  )
}

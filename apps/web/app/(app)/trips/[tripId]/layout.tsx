import { notFound } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/user'
import { getTrip } from '@/lib/trips'
import { TripProvider } from '@/lib/yjs/trip-doc'

export default async function TripLayout({ params, children }: LayoutProps<'/trips/[tripId]'>) {
  const { tripId } = await params
  const [trip, user] = await Promise.all([getTrip(tripId), getCurrentUser()])
  if (!trip) notFound()
  const { id, title, startDate, endDate, currencies, archived } = trip
  return (
    <TripProvider
      trip={{ id, title, startDate, endDate, currencies, archived }}
      user={{ name: user.name, color: user.color }}
    >
      {children}
    </TripProvider>
  )
}

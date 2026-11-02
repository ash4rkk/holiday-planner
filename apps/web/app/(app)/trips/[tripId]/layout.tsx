import { notFound } from 'next/navigation'
import { getTrip } from '@/lib/trips'
import { TripProvider } from '@/lib/yjs/trip-doc'

export default async function TripLayout({ params, children }: LayoutProps<'/trips/[tripId]'>) {
  const { tripId } = await params
  const trip = await getTrip(tripId)
  if (!trip) notFound()
  const { id, title, startDate, endDate, currencies, archived } = trip
  return (
    <TripProvider trip={{ id, title, startDate, endDate, currencies, archived }}>
      {children}
    </TripProvider>
  )
}

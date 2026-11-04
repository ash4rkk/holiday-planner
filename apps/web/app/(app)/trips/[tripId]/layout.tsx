import { notFound } from 'next/navigation'
import { UndoToast } from '@/components/undo-toast'
import { getCurrentUser } from '@/lib/auth/user'
import { countInbox } from '@/lib/inbox'
import { listTemplates } from '@/lib/templates'
import { getTrip } from '@/lib/trips'
import { TripProvider } from '@/lib/yjs/trip-doc'

export default async function TripLayout({ params, children }: LayoutProps<'/trips/[tripId]'>) {
  const { tripId } = await params
  const [trip, user, inboxCount, templates] = await Promise.all([
    getTrip(tripId),
    getCurrentUser(),
    countInbox(tripId).catch(() => 0),
    listTemplates(),
  ])
  if (!trip) notFound()
  const { id, title, startDate, endDate, currencies, archived } = trip
  return (
    <TripProvider
      trip={{
        id,
        title,
        startDate,
        endDate,
        currencies,
        archived,
        inboxCount,
        templates,
        routes: Boolean(process.env.GOOGLE_ROUTES_API_KEY),
      }}
      user={{ name: user.name, color: user.color }}
    >
      {children}
      <UndoToast />
    </TripProvider>
  )
}

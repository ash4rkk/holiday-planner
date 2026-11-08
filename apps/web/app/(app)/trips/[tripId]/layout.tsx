import { notFound } from 'next/navigation'
import { Flag } from '@/components/trips/flag'
import { UndoToast } from '@/components/undo-toast'
import { getCurrentUser } from '@/lib/auth/user'
import { listTemplates } from '@/lib/templates'
import { getTrip } from '@/lib/trips'
import { TripProvider } from '@/lib/yjs/trip-doc'

// Wejście do wyjazdu czeka na dane (wyjazd, profil, szablony) — pokazuje wtedy szkielet z
// /trips/loading.tsx. Przejścia między widokami wyjazdu tego layoutu nie przeładowują.
export const instant = false

export default async function TripLayout({ params, children }: LayoutProps<'/trips/[tripId]'>) {
  const { tripId } = await params
  const [trip, user, templates] = await Promise.all([
    getTrip(tripId),
    getCurrentUser(),
    listTemplates(),
  ])
  if (!trip) notFound()
  const { id, title, startDate, endDate, currencies, archived, travelMode, travelBufferMin } = trip
  const { timezone } = trip
  return (
    <TripProvider
      trip={{
        id,
        title,
        startDate,
        endDate,
        currencies,
        archived,
        templates,
        travelMode,
        travelBufferMin,
        timezone,
        flag: trip.country ? <Flag country={trip.country} className="h-3.5 w-[21px]" /> : undefined,
      }}
      user={{ name: user.name, color: user.color }}
    >
      {children}
      <UndoToast />
    </TripProvider>
  )
}

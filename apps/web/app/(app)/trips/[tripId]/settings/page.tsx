import { notFound } from 'next/navigation'
import { TopBar } from '@/components/top-bar'
import { TripForm } from '@/components/trips/trip-form'
import { buttonClass, Island } from '@/components/ui'
import { getTrip } from '@/lib/trips'
import { setTripArchived, updateTrip } from '../../actions'

export default async function TripSettingsPage({ params }: PageProps<'/trips/[tripId]/settings'>) {
  const { tripId } = await params
  const trip = await getTrip(tripId)
  if (!trip) notFound()

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-1">
      <TopBar
        title="ustawienia wyjazdu"
        back={{ href: `/trips/${trip.id}/list`, label: 'wróć do listy' }}
      />
      <Island className="p-4">
        <TripForm action={updateTrip.bind(null, trip.id)} trip={trip} submitLabel="zapisz" />
      </Island>
      <form action={setTripArchived.bind(null, trip.id, !trip.archived)} className="mt-1">
        <button type="submit" className={buttonClass('island', 'w-full')}>
          {trip.archived ? 'przywróć z archiwum' : 'przenieś do archiwum'}
        </button>
      </form>
      <p className="px-3 pt-2 text-xs text-subtle italic">
        Wyjazd w archiwum nadal można edytować; znika tylko z nadchodzących.
      </p>
    </main>
  )
}

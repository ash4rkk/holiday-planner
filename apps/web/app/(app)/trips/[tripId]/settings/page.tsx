import { notFound } from 'next/navigation'
import { OfflineMapPanel } from '@/components/map/offline-map-panel'
import { TopBar } from '@/components/top-bar'
import { FamilyLink } from '@/components/trips/family-link'
import { TripForm } from '@/components/trips/trip-form'
import { buttonClass, Island } from '@/components/ui'
import { tripSettingsBack } from '@/lib/back'
import { activeShareLink } from '@/lib/share-links'
import { getTrip } from '@/lib/trips'
import { setTripArchived, updateTrip } from '../../actions'

export default async function TripSettingsPage({
  params,
  searchParams,
}: PageProps<'/trips/[tripId]/settings'>) {
  const [{ tripId }, { from }] = await Promise.all([params, searchParams])
  const trip = await getTrip(tripId)
  if (!trip) notFound()
  const token = await activeShareLink(trip.id)
  const exportUrl = (format: string) => `/api/export/${trip.id}?format=${format}`

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-1">
      <TopBar title="ustawienia wyjazdu" back={tripSettingsBack(trip.id, from)} />
      <Island className="p-4">
        <TripForm action={updateTrip.bind(null, trip.id)} trip={trip} submitLabel="zapisz" />
      </Island>
      <section id="eksport" className="island mt-1 flex scroll-mt-2 flex-col gap-2 p-4 text-sm">
        <p className="font-bold">eksport</p>
        <div className="grid grid-cols-3 gap-1">
          <a href={exportUrl('pdf')} className={buttonClass('island', 'px-2')}>
            PDF
          </a>
          <a href={exportUrl('md')} className={buttonClass('island', 'px-2')}>
            Markdown
          </a>
          <a
            href={exportUrl('html')}
            target="_blank"
            rel="noreferrer"
            className={buttonClass('island', 'px-2')}
          >
            do druku
          </a>
        </div>
        <p className="text-xs text-subtle italic">
          plan dzień po dniu z treścią kart, kwotami i nazwami plików
        </p>
      </section>
      <OfflineMapPanel />
      <div id="rodzina" className="scroll-mt-2">
        <FamilyLink tripId={trip.id} tripTitle={trip.title} token={token} />
      </div>
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

import { TopBar } from '@/components/top-bar'
import { Island } from '@/components/ui'
import { getTrip } from '@/lib/trips'

export default async function Page({ params }: PageProps<'/trips/[tripId]/board'>) {
  const { tripId } = await params
  const trip = await getTrip(tripId)
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-1">
      <TopBar title={trip?.title ?? 'tablica'} />
      <Island className="p-4 text-sm text-muted">● tablica pojawi się w etapie 2</Island>
    </main>
  )
}

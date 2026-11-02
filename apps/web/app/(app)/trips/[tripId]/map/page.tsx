import { TopBar } from '@/components/top-bar'
import { Island } from '@/components/ui'
import { getTrip } from '@/lib/trips'

export default async function Page({ params }: PageProps<'/trips/[tripId]/map'>) {
  const { tripId } = await params
  const trip = await getTrip(tripId)
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-1">
      <TopBar title={trip?.title ?? 'mapa'} />
      <Island className="p-4 text-sm text-muted">● mapa pojawi się w etapie 4</Island>
    </main>
  )
}

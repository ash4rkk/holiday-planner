import { TopBar } from '@/components/top-bar'
import { TripForm } from '@/components/trips/trip-form'
import { Island } from '@/components/ui'
import { createTrip } from '../actions'

export default function NewTripPage() {
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-1">
      <TopBar title="nowy wyjazd" back={{ href: '/trips', label: 'wróć do wyjazdów' }} />
      <Island className="p-4">
        <TripForm action={createTrip} submitLabel="utwórz wyjazd" />
      </Island>
    </main>
  )
}

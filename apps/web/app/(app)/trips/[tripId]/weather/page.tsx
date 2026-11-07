import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { TripWeather } from '@/components/weather-page/trip-weather'
import { tripPlace } from '@/lib/trip-place'
import { getTrip } from '@/lib/trips'

export default async function WeatherPage({ params }: PageProps<'/trips/[tripId]/weather'>) {
  const { tripId } = await params
  const trip = await getTrip(tripId)
  if (!trip) notFound()
  // Zapas, gdy karty nie mają jeszcze miejsc: miejsce z nazwy wyjazdu i kraju.
  const fallback = await tripPlace(trip)
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-1">
      <Suspense>
        <TripWeather fallback={fallback} />
      </Suspense>
    </main>
  )
}

import { redirect } from 'next/navigation'

export default async function TripPage({ params }: PageProps<'/trips/[tripId]'>) {
  const { tripId } = await params
  redirect(`/trips/${tripId}/today`)
}

import { connection } from 'next/server'
import { Suspense } from 'react'
import { ShareScreen } from '@/components/share/share-screen'
import { listTrips } from '@/lib/trips'

export default async function SharePage() {
  await connection()
  const { current, upcoming, past } = await listTrips()
  // Domyślnie trwający albo najbliższy wyjazd; minione na końcu (np. dopisanie paragonu po powrocie).
  const trips = [...current, ...upcoming, ...past].map(({ id, title, startDate, endDate }) => ({
    id,
    title,
    startDate,
    endDate,
  }))
  return (
    <Suspense>
      <ShareScreen trips={trips} />
    </Suspense>
  )
}

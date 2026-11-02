import { Suspense } from 'react'
import { TripMap } from '@/components/map/trip-map'

export default function MapPage() {
  return (
    <Suspense>
      <TripMap />
    </Suspense>
  )
}

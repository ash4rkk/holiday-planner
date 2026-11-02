import { Suspense } from 'react'
import { TripList } from '@/components/list/trip-list'

export default function ListPage() {
  return (
    <Suspense>
      <TripList />
    </Suspense>
  )
}

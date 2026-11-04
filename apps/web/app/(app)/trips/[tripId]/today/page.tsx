import { Suspense } from 'react'
import { OfflinePrefetch } from '@/components/offline-prefetch'
import { TodayDashboard } from '@/components/today/today-dashboard'
import { getCurrentUser } from '@/lib/auth/user'

export default async function TodayPage({ params }: PageProps<'/trips/[tripId]/today'>) {
  const [{ tripId }, user] = await Promise.all([params, getCurrentUser()])
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-1">
      {/* Bilety wyjazdu mają być na telefonie bez czekania. */}
      <OfflinePrefetch tripId={tripId} />
      <Suspense>
        <TodayDashboard userName={user.name} />
      </Suspense>
    </main>
  )
}

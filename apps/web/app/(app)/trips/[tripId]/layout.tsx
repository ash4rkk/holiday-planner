import { asc, getDb, users } from '@planer/core/db'
import { getPackingDays } from '@planer/core/settings'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { PackingDrawer } from '@/components/packing/packing-drawer'
import { PackingTab } from '@/components/packing/packing-tab'
import { Flag } from '@/components/trips/flag'
import { UndoToast } from '@/components/undo-toast'
import { getCurrentUser } from '@/lib/auth/user'
import { listTemplates } from '@/lib/templates'
import { getTrip } from '@/lib/trips'
import { TripProvider } from '@/lib/yjs/trip-doc'

// Wejście do wyjazdu czeka na dane (wyjazd, profil, szablony, osoby do listy pakowania) — pokazuje wtedy szkielet z
// /trips/loading.tsx. Przejścia między widokami wyjazdu tego layoutu nie przeładowują.
export const instant = false

export default async function TripLayout({ params, children }: LayoutProps<'/trips/[tripId]'>) {
  const { tripId } = await params
  const [trip, user, templates, people, packingDays] = await Promise.all([
    getTrip(tripId),
    getCurrentUser(),
    listTemplates(),
    getDb().select({ name: users.name }).from(users).orderBy(asc(users.createdAt)),
    getPackingDays(),
  ])
  if (!trip) notFound()
  const { id, title, startDate, endDate, currencies, archived, travelMode, travelBufferMin } = trip
  const { timezone } = trip
  return (
    <TripProvider
      trip={{
        id,
        title,
        startDate,
        endDate,
        currencies,
        archived,
        templates,
        travelMode,
        travelBufferMin,
        timezone,
        packingDays,
        demoWeather: trip.demoWeather ?? undefined,
        flag: trip.country ? <Flag country={trip.country} className="h-3.5 w-[21px]" /> : undefined,
      }}
      user={{ name: user.name, color: user.color }}
    >
      {children}
      <Suspense>
        <PackingDrawer people={people.map((p) => p.name)} />
        <PackingTab />
      </Suspense>
      <UndoToast />
    </TripProvider>
  )
}

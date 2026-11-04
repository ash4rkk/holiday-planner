import { daysBetween, todayLocal } from '@planer/core'
import Link from 'next/link'
import { ProfilePhoto } from '@/components/profile/profile-photo'
import { TopBar } from '@/components/top-bar'
import { TripRow } from '@/components/trips/trip-row'
import { buttonClass, SectionLabel } from '@/components/ui'
import { getCurrentUser } from '@/lib/auth/user'
import { listTrips } from '@/lib/trips'

export const dynamic = 'force-dynamic'

export default async function TripsPage() {
  const [user, { current, upcoming, past, archived }] = await Promise.all([
    getCurrentUser(),
    listTrips(),
  ])
  const today = todayLocal()
  const empty = !current.length && !upcoming.length && !past.length && !archived.length

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-1">
      <TopBar
        title="wyjazdy"
        actions={
          <Link
            href="/settings"
            aria-label="ustawienia"
            className="island flex size-11 shrink-0 items-center justify-center overflow-hidden text-muted hover:border-accent"
          >
            <ProfilePhoto name={user.name} className="size-full text-sm" />
          </Link>
        }
      />

      <Link href="/trips/new" className={buttonClass('primary', 'mt-1')}>
        + nowy wyjazd
      </Link>

      {empty && <p className="island mt-1 p-4 text-sm text-muted">● jeszcze nie ma wyjazdów</p>}

      {current.length > 0 && <SectionLabel>trwa</SectionLabel>}
      {current.map((t) => (
        <TripRow key={t.id} trip={t} note="teraz" />
      ))}

      {upcoming.length > 0 && <SectionLabel>nadchodzące</SectionLabel>}
      {upcoming.map((t) => (
        <TripRow
          key={t.id}
          trip={t}
          note={t.startDate ? `za ${daysBetween(today, t.startDate)} dni` : undefined}
        />
      ))}

      {past.length > 0 && <SectionLabel>minione</SectionLabel>}
      {past.map((t) => (
        <TripRow key={t.id} trip={t} />
      ))}

      {archived.length > 0 && <SectionLabel>archiwum</SectionLabel>}
      {archived.map((t) => (
        <TripRow key={t.id} trip={t} />
      ))}
    </main>
  )
}

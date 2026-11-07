import { daysBetween, todayLocal } from '@planer/core'
import type { Trip } from '@planer/core/db'
import Link from 'next/link'
import { ProfilePhoto } from '@/components/profile/profile-photo'
import { TopBar } from '@/components/top-bar'
import { CurrentTrip } from '@/components/trips/current-trip'
import { countryName, Flag } from '@/components/trips/flag'
import { TripRow } from '@/components/trips/trip-row'
import { buttonClass, SectionLabel } from '@/components/ui'
import { getCurrentUser } from '@/lib/auth/user'
import { tripSummary } from '@/lib/trip-summary'
import { listTrips } from '@/lib/trips'

export const dynamic = 'force-dynamic'

/** Zwinięta grupa (minione, archiwum): wiersz z liczbą, po rozwinięciu wyjazdy. */
function Folded({ label, trips }: { label: string; trips: Trip[] }) {
  if (!trips.length) return null
  return (
    <details className="group mt-1 flex flex-col">
      <summary className="island flex min-h-11 cursor-pointer list-none items-center justify-between px-4 text-sm text-muted hover:text-accent [&::-webkit-details-marker]:hidden">
        <span>
          {label} · {trips.length}
        </span>
        <span aria-hidden="true" className="transition-transform group-open:rotate-90">
          ›
        </span>
      </summary>
      <div className="mt-1 flex flex-col gap-1">
        {trips.map((t) => (
          <TripRow key={t.id} trip={t} />
        ))}
      </div>
    </details>
  )
}

export default async function TripsPage() {
  const today = todayLocal()
  const [user, { current, upcoming, past, archived }] = await Promise.all([
    getCurrentUser(),
    listTrips(),
  ])
  const summaries = await Promise.all(current.map((t) => tripSummary(t, today)))
  const empty = !current.length && !upcoming.length && !past.length && !archived.length

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-1">
      <TopBar
        title="wyjazdy"
        menu={
          <Link
            href="/trips/new"
            aria-label="nowy wyjazd"
            title="nowy wyjazd"
            className="flex w-11 self-stretch items-center justify-center border-l border-line text-xl text-accent hover:text-accent-hover"
          >
            +
          </Link>
        }
        actions={
          <Link
            href="/settings"
            aria-label="ustawienia"
            title="ustawienia"
            className="flex size-11 shrink-0 items-center justify-center"
          >
            <ProfilePhoto
              name={user.name}
              className="size-[26px] overflow-hidden rounded-full border border-line text-xs"
            />
          </Link>
        }
      />

      {empty && (
        <div className="island mt-1 flex flex-col gap-3 p-4">
          <p className="text-sm text-muted">● jeszcze nie ma wyjazdów</p>
          <Link href="/trips/new" className={buttonClass('primary')}>
            + nowy wyjazd
          </Link>
        </div>
      )}

      {current.map((t, i) => (
        <div key={t.id} className="mt-1">
          <CurrentTrip
            trip={t}
            summary={summaries[i] as (typeof summaries)[number]}
            today={today}
            flag={<Flag country={t.country} className="h-[18px] w-[27px]" />}
            country={countryName(t.country)}
          />
        </div>
      ))}

      {upcoming.length > 0 && <SectionLabel>nadchodzące</SectionLabel>}
      {upcoming.map((t) => (
        <TripRow
          key={t.id}
          trip={t}
          countdown={t.startDate ? daysBetween(today, t.startDate) : undefined}
        />
      ))}

      <Folded label="minione" trips={past} />
      <Folded label="archiwum" trips={archived} />
    </main>
  )
}

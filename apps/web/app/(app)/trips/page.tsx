import { daysBetween, leaveInYear, personLeaveDays, regionOf, todayLocal } from '@planer/core'
import type { Trip } from '@planer/core/db'
import { getLeaveRegions } from '@planer/core/settings'
import { CalendarDays, Plus } from 'lucide-react'
import Link from 'next/link'
import { connection } from 'next/server'
import { ProfilePhoto } from '@/components/profile/profile-photo'
import { TopBar } from '@/components/top-bar'
import { CurrentTrip } from '@/components/trips/current-trip'
import { countryName, Flag } from '@/components/trips/flag'
import { TripRow } from '@/components/trips/trip-row'
import { buttonClass, SectionLabel } from '@/components/ui'
import { getCurrentUser } from '@/lib/auth/user'
import { listLeave } from '@/lib/leave'
import { listProfiles } from '@/lib/profiles'
import { tripSummary } from '@/lib/trip-summary'
import { listTrips } from '@/lib/trips'

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

/** Ile lat urlopu (od bieżącego) pokazuje wiersz planera. */
const LEAVE_YEARS = 3

export default async function TripsPage() {
  await connection()
  const today = todayLocal()
  const year = Number(today.slice(0, 4))
  const [user, { current, upcoming, past, archived }, leave, region] = await Promise.all([
    getCurrentUser(),
    listTrips(),
    listLeave(`${year}-01-01`, `${year + LEAVE_YEARS - 1}-12-31`).catch(() => []),
    getLeaveRegions().catch(() => ({ fallback: 'PL' as const, byPerson: {} })),
  ])
  const persons = listProfiles(user.name).map((p) => p.name)
  // Dni urlopu na osobę w tym roku i kolejnych, w których już coś zaplanowano („2027: Arek 18 ·
  // Wera 14”); bez profili jedna suma. Bieżący rok zawsze, kolejne tylko z urlopem.
  const yearText = (y: number) => {
    const from = `${y}-01-01`
    const to = `${y}-12-31`
    const counts = persons.length
      ? persons.map((p) => ({ p, n: personLeaveDays(leave, p, from, to, regionOf(region, p)) }))
      : [{ p: '', n: leaveInYear(leave, y, region.fallback) }]
    return {
      y,
      any: counts.some((c) => c.n > 0),
      text: persons.length
        ? counts.map((c) => `${c.p} ${c.n}`).join(' · ')
        : `${counts[0]?.n ?? 0} dni`,
    }
  }
  const leaveYears = Array.from({ length: LEAVE_YEARS }, (_, i) => yearText(year + i)).filter(
    (r, i) => r.any || i === 0,
  )
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
            className="flex w-11 self-stretch items-center justify-center border-l border-line text-accent hover:text-accent-hover"
          >
            <Plus className="size-5" aria-hidden="true" />
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

      <Link
        href="/leave"
        className="island mt-1 flex min-h-12 items-center gap-3 px-4 py-2 text-sm hover:text-accent"
      >
        <CalendarDays className="size-4 shrink-0 text-muted" aria-hidden="true" />
        <span className="flex-1">planer urlopów</span>
        <span className="flex flex-col items-end text-muted tabular-nums">
          {leaveYears.map((r) => (
            <span key={r.y}>
              {r.y}: {r.text}
            </span>
          ))}
        </span>
        <span aria-hidden="true" className="text-muted">
          ›
        </span>
      </Link>

      <Folded label="minione" trips={past} />
      <Folded label="archiwum" trips={archived} />
    </main>
  )
}

import { daysBetween, todayLocal } from '@planer/core'
import Link from 'next/link'
import { OfflinePrefetch } from '@/components/offline-prefetch'
import { TopBar } from '@/components/top-bar'
import { TripRow } from '@/components/trips/trip-row'
import { buttonClass, SectionLabel } from '@/components/ui'
import { getCurrentUser } from '@/lib/auth/user'
import { listTrips } from '@/lib/trips'

export const dynamic = 'force-dynamic'

function plural(n: number, one: string, few: string, many: string) {
  if (n === 1) return one
  const d = n % 10
  const t = n % 100
  return d >= 2 && d <= 4 && (t < 12 || t > 14) ? few : many
}

export default async function PulpitPage() {
  const [user, { current, upcoming }] = await Promise.all([getCurrentUser(), listTrips()])
  const today = todayLocal()
  const header = new Intl.DateTimeFormat('pl-PL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date())
  const now = current[0]
  const next = upcoming.find((t) => t.startDate)

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-1">
      <TopBar title="dziś" subtitle={header} />
      {/* Bilety trwającego albo najbliższego wyjazdu mają być na telefonie bez czekania. */}
      <OfflinePrefetch tripId={(now ?? next)?.id} />

      <section className="island border-t-2 border-t-accent p-4">
        <p className="text-xl font-bold">cześć, {user.name}</p>
        {now?.startDate ? (
          <p className="mt-1 text-sm text-muted">
            dzień {daysBetween(now.startDate, today) + 1} wyjazdu{' '}
            <Link href={`/trips/${now.id}/list`} className="text-accent">
              {now.title} ›
            </Link>
          </p>
        ) : next?.startDate ? (
          <p className="mt-1 text-sm text-muted">
            {(() => {
              const n = daysBetween(today, next.startDate)
              return `za ${n} ${plural(n, 'dzień', 'dni', 'dni')}: `
            })()}
            <Link href={`/trips/${next.id}/list`} className="text-accent">
              {next.title} ›
            </Link>
          </p>
        ) : (
          <p className="mt-1 text-sm text-muted">● nie ma zaplanowanych wyjazdów</p>
        )}
        <p className="mt-2 text-xs text-subtle italic">
          plan dnia, dojazd, pogoda i wydatki — etap 6
        </p>
      </section>

      {current.length + upcoming.length > 0 && <SectionLabel>wyjazdy</SectionLabel>}
      {[...current, ...upcoming].slice(0, 4).map((t) => (
        <TripRow key={t.id} trip={t} />
      ))}

      <div className="mt-1 grid grid-cols-2 gap-1">
        <Link href="/trips" className={buttonClass('island')}>
          wszystkie wyjazdy
        </Link>
        <Link href="/trips/new" className={buttonClass('primary')}>
          + nowy wyjazd
        </Link>
      </div>
    </main>
  )
}

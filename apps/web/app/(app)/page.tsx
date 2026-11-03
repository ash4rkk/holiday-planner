import { daysBetween, todayLocal } from '@planer/core'
import { Settings } from 'lucide-react'
import Link from 'next/link'
import { Suspense } from 'react'
import { OfflinePrefetch } from '@/components/offline-prefetch'
import { TodayDashboard } from '@/components/today/today-dashboard'
import { TopBar } from '@/components/top-bar'
import { TripRow } from '@/components/trips/trip-row'
import { buttonClass, SectionLabel } from '@/components/ui'
import { getCurrentUser } from '@/lib/auth/user'
import { countInbox } from '@/lib/inbox'
import { listTemplates } from '@/lib/templates'
import { listTrips } from '@/lib/trips'
import { TripProvider } from '@/lib/yjs/trip-doc'

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
      <TopBar
        title="dziś"
        subtitle={header}
        actions={
          <Link
            href="/settings"
            aria-label="ustawienia"
            className="island flex size-11 shrink-0 items-center justify-center text-muted hover:text-accent"
          >
            <Settings className="size-5" aria-hidden="true" />
          </Link>
        }
      />
      {/* Bilety trwającego albo najbliższego wyjazdu mają być na telefonie bez czekania. */}
      <OfflinePrefetch tripId={(now ?? next)?.id} />

      {now ? (
        // W trakcie wyjazdu: plan dnia z dokumentu wyjazdu (IndexedDB + sync).
        <TripProvider
          trip={{
            id: now.id,
            title: now.title,
            startDate: now.startDate,
            endDate: now.endDate,
            currencies: now.currencies,
            archived: now.archived,
            inboxCount: await countInbox(now.id).catch(() => 0),
            templates: await listTemplates(),
          }}
          user={{ name: user.name, color: user.color }}
        >
          <Suspense>
            <TodayDashboard userName={user.name} />
          </Suspense>
        </TripProvider>
      ) : (
        <section className="island border-t-2 border-t-accent p-4">
          <p className="text-xl font-bold">cześć, {user.name}</p>
          {next?.startDate ? (
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
        </section>
      )}

      {current.length + upcoming.length > (now ? 1 : 0) && <SectionLabel>wyjazdy</SectionLabel>}
      {[...current, ...upcoming]
        .filter((t) => t.id !== now?.id)
        .slice(0, 4)
        .map((t) => (
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

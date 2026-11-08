import { recentEvents } from '@planer/core/events'
import Link from 'next/link'
import { connection } from 'next/server'
import { SETTINGS_BACK } from '@/components/settings/settings-row'
import { TopBar } from '@/components/top-bar'
import { cx } from '@/components/ui'

const TZ = 'Europe/Warsaw'
const day = new Intl.DateTimeFormat('pl-PL', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: TZ,
})
const time = new Intl.DateTimeFormat('pl-PL', { hour: '2-digit', minute: '2-digit', timeZone: TZ })
const DOT = { error: 'bg-red', warn: 'bg-amber', ok: 'bg-green' } as const

export default async function LogsPage({ searchParams }: PageProps<'/settings/logs'>) {
  await connection()
  const { all } = await searchParams
  const showAll = all === '1'
  const events = (await recentEvents(7 * 24)).filter((e) => showAll || e.level !== 'ok')
  // Grupy wg dnia, od najnowszych.
  const groups = new Map<string, typeof events>()
  for (const e of events) {
    const key = day.format(e.at)
    groups.set(key, [...(groups.get(key) ?? []), e])
  }

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-1">
      <TopBar title="logi i problemy" back={SETTINGS_BACK} />
      <div className="flex gap-1 px-1 text-sm">
        <Link
          href="/settings/logs"
          className={cx(
            'rounded-small px-3 py-2',
            !showAll ? 'bg-active text-accent' : 'text-muted',
          )}
        >
          problemy
        </Link>
        <Link
          href="/settings/logs?all=1"
          className={cx(
            'rounded-small px-3 py-2',
            showAll ? 'bg-active text-accent' : 'text-muted',
          )}
        >
          wszystko
        </Link>
      </div>
      {events.length === 0 && (
        <p className="island p-4 text-sm text-muted">
          ● {showAll ? 'brak wpisów' : 'bez problemów'} w ostatnich 7 dniach
        </p>
      )}
      {[...groups].map(([label, list]) => (
        <section key={label} className="flex flex-col gap-1">
          <h2 className="px-3 pt-3 pb-1 text-xs text-subtle italic">{label}</h2>
          <ul className="island">
            {list.map((e) => (
              <li
                key={e.id}
                className="flex items-start gap-3 border-line px-4 py-2.5 text-sm not-first:border-t"
              >
                <span
                  className={cx('mt-1.5 size-2 shrink-0 rounded-full', DOT[e.level])}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                  <span className="block break-words">{e.message}</span>
                  <span className="block text-xs text-subtle">{e.source}</span>
                </span>
                <span className="shrink-0 text-xs text-subtle">{time.format(e.at)}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p className="px-3 pt-2 text-xs text-subtle italic">
        Wpisy z workera, serwera sync i usług zewnętrznych; starsze niż 30 dni znikają same.
      </p>
    </main>
  )
}

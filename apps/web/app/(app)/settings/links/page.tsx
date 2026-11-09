import { formatDateSpan } from '@planer/core'
import Link from 'next/link'
import { connection } from 'next/server'
import { SETTINGS_BACK } from '@/components/settings/settings-row'
import { TopBar } from '@/components/top-bar'
import { activeFamilyLinks } from '@/lib/settings-data'
import { revokeLink } from '../actions'

const created = new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'short' })

export default async function LinksPage() {
  await connection()
  const links = await activeFamilyLinks()
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-1">
      <TopBar title="linki dla rodziny" back={SETTINGS_BACK} />
      {links.length === 0 ? (
        <p className="island p-4 text-sm text-muted">● żaden wyjazd nie ma aktywnego linku</p>
      ) : (
        <ul className="island">
          {links.map((l) => (
            <li
              key={l.token}
              className="flex items-center gap-3 border-line px-4 py-3 not-first:border-t"
            >
              <Link href={`/trips/${l.tripId}/settings#rodzina`} className="min-w-0 flex-1">
                <span className="block truncate font-bold">{l.tripTitle}</span>
                <span className="block text-xs text-subtle">
                  {formatDateSpan(l.startDate, l.endDate)} · od {created.format(l.createdAt)}
                  {l.createdBy && ` · ${l.createdBy}`}
                </span>
              </Link>
              <form action={revokeLink.bind(null, l.token)}>
                <button
                  type="submit"
                  className="min-h-11 rounded-small px-2 text-sm text-red hover:bg-red/15"
                >
                  unieważnij
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
      <p className="px-3 pt-2 text-xs text-subtle">
        Po unieważnieniu link przestaje działać od razu. Nowy utworzysz w ustawieniach wyjazdu.
      </p>
    </main>
  )
}

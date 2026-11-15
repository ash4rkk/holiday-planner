import { HOLIDAY_REGIONS, REGION_LABEL } from '@planer/core'
import { calendarEvents, count, getDb } from '@planer/core/db'
import { getLeaveRegion } from '@planer/core/settings'
import { type TimeTreeCalendar, timetreeClient, timetreeConfigured } from '@planer/core/timetree'
import { connection } from 'next/server'
import { CalendarActions, IcsUpload } from '@/components/settings/calendar-controls'
import { TopBar } from '@/components/top-bar'
import { buttonClass, inputClass, SectionLabel } from '@/components/ui'
import { appSettingsBack } from '@/lib/back'
import { listCalendars } from '@/lib/leave'
import { addTimetreeCalendar, saveLeaveRegion } from './actions'

// Ustawienia czytają bazę (i TimeTree) przy każdym wejściu — wejście może chwilę poczekać.
export const instant = false

const synced = new Intl.DateTimeFormat('pl-PL', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Warsaw',
})

export default async function CalendarsPage({ searchParams }: PageProps<'/settings/calendars'>) {
  await connection()
  const { from } = await searchParams
  const [region, list, counts] = await Promise.all([
    getLeaveRegion(),
    listCalendars(),
    getDb()
      .select({ id: calendarEvents.calendarId, n: count() })
      .from(calendarEvents)
      .groupBy(calendarEvents.calendarId),
  ])
  const countOf = new Map(counts.map((c) => [c.id, c.n]))

  let remote: TimeTreeCalendar[] = []
  let remoteError: string | undefined
  if (timetreeConfigured()) {
    try {
      const added = new Set(list.filter((c) => c.source === 'timetree').map((c) => c.externalId))
      remote = (await timetreeClient().calendars()).filter((c) => !added.has(c.id))
    } catch (error) {
      remoteError = error instanceof Error ? error.message : String(error)
    }
  }

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-1">
      <TopBar
        title="kalendarze i święta"
        back={
          from === '/leave'
            ? appSettingsBack(from)
            : { href: '/settings', label: 'wróć do ustawień' }
        }
      />

      <SectionLabel>liczenie urlopu</SectionLabel>
      <form action={saveLeaveRegion} className="island flex flex-col gap-3 p-4 text-sm">
        <p className="text-xs text-subtle">
          dni urlopu to dni robocze bez weekendów i świąt wybranego regionu — wspólne dla was obojga
        </p>
        <div className="grid grid-cols-2 gap-1">
          {HOLIDAY_REGIONS.map((r) => (
            <label
              key={r}
              className="flex min-h-11 items-center gap-2 rounded-small border border-line px-3 has-checked:border-accent has-checked:bg-active"
            >
              <input
                type="radio"
                name="region"
                value={r}
                defaultChecked={region === r}
                className="accent-(--accent)"
              />
              {REGION_LABEL[r]}
            </label>
          ))}
        </div>
        <button type="submit" className={buttonClass('primary')}>
          zapisz
        </button>
        <p className="text-xs text-subtle">
          co widać na kalendarzu, włączasz w planerze w „warstwy” — na każdym urządzeniu osobno
        </p>
      </form>

      <SectionLabel>kalendarze</SectionLabel>
      {list.length === 0 && (
        <p className="island p-4 text-sm text-muted">
          ● jeszcze nie ma kalendarzy — dodaj z TimeTree albo z pliku
        </p>
      )}
      {list.map((c) => (
        <section key={c.id} className="island flex flex-col gap-2 p-4 text-sm">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-bold">{c.name}</span>
            <span className="text-xs text-subtle">
              {c.source === 'timetree' ? 'TimeTree' : 'plik .ics'}
            </span>
          </div>
          <p className="text-xs text-muted">
            {countOf.get(c.id) ?? 0} wydarzeń
            {c.lastSyncAt &&
              ` · ${c.source === 'timetree' ? 'pobrane' : 'wgrane'} ${synced.format(c.lastSyncAt)}`}
            {c.source === 'timetree' && ' · co godzinę'}
          </p>
          {c.lastError && <p className="text-xs text-amber">● {c.lastError}</p>}
          <CalendarActions id={c.id} name={c.name} source={c.source} />
        </section>
      ))}

      <SectionLabel>dodaj z TimeTree</SectionLabel>
      <div className="island flex flex-col gap-2 p-4 text-sm">
        {!timetreeConfigured() ? (
          <p className="text-xs text-amber">
            ● brak TIMETREE_EMAIL i TIMETREE_PASSWORD w .env na serwerze
          </p>
        ) : remoteError ? (
          <p className="text-xs text-amber">● {remoteError}</p>
        ) : remote.length === 0 ? (
          <p className="text-xs text-muted">wszystkie kalendarze z TimeTree są już dodane</p>
        ) : (
          remote.map((r) => (
            <form key={r.id} action={addTimetreeCalendar} className="flex items-center gap-2">
              <input type="hidden" name="externalId" value={r.id} />
              <input
                name="name"
                defaultValue={r.name}
                aria-label="nazwa w planerze"
                className={inputClass}
              />
              <button type="submit" className={buttonClass('primary', 'shrink-0')}>
                dodaj
              </button>
            </form>
          ))
        )}
        <p className="text-xs text-subtle">
          TimeTree nie ma oficjalnego API — planer loguje się jak aplikacja webowa i może przestać
          działać po zmianach po ich stronie
        </p>
      </div>

      <SectionLabel>dodaj z pliku</SectionLabel>
      <div className="island flex flex-wrap items-center gap-2 p-4 text-sm">
        <p className="w-full text-xs text-subtle">
          eksport z Kalendarza Google, Outlooka albo Apple; powtarzające się wydarzenia liczymy od
          zeszłego roku do dwóch lat naprzód
        </p>
        <IcsUpload />
      </div>
    </main>
  )
}

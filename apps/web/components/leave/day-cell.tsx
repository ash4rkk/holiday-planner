'use client'

import { cx } from '@/components/ui'
import { type DayIndex, ERASE_CELL, eventColor, type LeaveAt, leaveBg, type PaintAt } from './model'

export type MarkKind = 'pl' | 'bb' | 'event'

/**
 * Znaczek w kalendarzu: święto w Polsce (kropka), w Brandenburgii (romb), wydarzenie z kalendarza
 * (mała kropka). Kolor i kształt naraz, żeby dało się je odróżnić bez koloru. Na urlopie z jasną
 * obwódką, bo tło to akcent.
 */
export function Mark({
  kind,
  onLeave,
  color,
}: {
  kind: MarkKind
  onLeave?: boolean
  /** kolor wydarzenia (etykieta TimeTree) */
  color?: string | null
}) {
  return (
    <span
      aria-hidden="true"
      style={kind === 'event' && color ? { backgroundColor: color } : undefined}
      className={cx(
        'inline-block shrink-0',
        kind === 'pl' && 'size-1.5 rounded-full bg-hol-pl',
        kind === 'bb' && 'size-1.5 rotate-45 rounded-[1px] bg-hol-bb',
        kind === 'event' && 'size-1 rounded-full bg-event',
        onLeave && 'ring-1 ring-on-accent',
      )}
    />
  )
}

/** Urlop do zatwierdzenia: pusta kropka „czeka” (status kształtem, nie tylko jasnością tła). */
export function PendingMark() {
  return (
    <span
      aria-hidden="true"
      className="inline-block size-[7px] shrink-0 rounded-full border-[1.5px] border-current"
    />
  )
}

export function HolidayMarks({
  marks,
  onLeave,
}: {
  marks: { region: string }[]
  onLeave?: boolean
}) {
  return (
    <>
      {marks.map((h) => (
        <Mark key={h.region} kind={h.region === 'PL' ? 'pl' : 'bb'} onLeave={onLeave} />
      ))}
    </>
  )
}

export function dayTitle(date: string, index: DayIndex): string {
  const parts = [
    ...index.holidays(date).map((h) => (h.region === 'PL' ? h.name : `${h.localName} (BB)`)),
    ...index.trips(date).map((t) => `wyjazd: ${t.title}`),
    ...index.events(date).map((e) => (e.startTime ? `${e.startTime} ${e.title}` : e.title)),
  ]
  return parts.join(' · ')
}

/** Mała komórka dnia w siatce miesiąca. */
export function DayCell({
  date,
  index,
  today,
  picking,
  onPick,
  paintAt,
  leaveAt,
}: {
  date: string
  index: DayIndex
  today: string
  picking: string | null
  onPick: (date: string) => void
  paintAt?: PaintAt
  leaveAt: LeaveAt
}) {
  const paint = paintAt?.(date) ?? null
  const leave = leaveAt(date)
  const period = Boolean(leave)
  const holidays = index.holidays(date)
  const trips = index.trips(date)
  const events = index.events(date)
  const off = index.off(date)
  const title = dayTitle(date, index)
  // Wielodniowe wydarzenie: pasek u góry dnia (ciągnie się przez kolejne dni), jednodniowe: kropka.
  const multi = events.filter((e) => e.startDate !== e.endDate)
  const single = events.find((e) => e.startDate === e.endDate)
  return (
    <button
      type="button"
      data-date={date}
      onClick={() => onPick(date)}
      aria-label={`${Number(date.slice(8))}${period ? (leave?.approved ? ', urlop' : ', urlop do zatwierdzenia') : ''}${title ? `, ${title}` : ''}`}
      className={cx(
        'relative flex aspect-square min-w-0 flex-col items-center justify-center rounded-small text-xs tabular-nums',
        leave ? leave.cls : paint === 'erase' ? ERASE_CELL : off ? 'text-subtle' : 'text-text',
        picking === date && 'ring-1 ring-accent',
        date === today && 'outline outline-1 -outline-offset-1 outline-sel',
        !period && 'hover:text-accent',
      )}
    >
      <span>{Number(date.slice(8))}</span>
      <span className="flex h-1.5 items-center gap-0.5">
        <HolidayMarks marks={holidays} onLeave={!!period} />
        {single && <Mark kind="event" color={eventColor(single)} onLeave={!!period} />}
        {leave && !leave.approved && <PendingMark />}
      </span>
      {multi.length > 0 && (
        <span
          aria-hidden="true"
          style={{ backgroundColor: eventColor(multi[0] as { color: string | null }) }}
          className={cx(
            'absolute top-0.5 h-[3px]',
            multi.some((e) => e.startDate === date) ? 'left-1 rounded-l-full' : '-left-px',
            multi.some((e) => e.endDate === date) ? 'right-1 rounded-r-full' : '-right-px',
          )}
        />
      )}
      {trips.length > 0 && (
        <span
          aria-hidden="true"
          className="absolute inset-x-1 bottom-0.5 h-0.5 rounded-full bg-trip"
        />
      )}
    </button>
  )
}

/** Dni urlopu w nagłówku miesiąca: „10 dni” albo kropka osoby z liczbą („● 3 ● 5”). */
export function LeaveStat({
  stats,
  persons,
}: {
  stats: { person: string | null; days: number }[]
  persons: string[]
}) {
  if (!stats.length) return null
  if (stats.length === 1 && stats[0]?.person === null) return <>{stats[0].days} dni</>
  return (
    <span className="inline-flex items-center gap-1.5">
      {stats.map((s) => (
        <span
          key={s.person ?? '∅'}
          className="inline-flex items-center gap-0.5"
          title={s.person ?? ''}
        >
          <span
            aria-hidden="true"
            className={`inline-block size-2 rounded-[2px] ${leaveBg(s.person, persons)}`}
          />
          <span className="sr-only">{s.person}</span>
          {s.days}
        </span>
      ))}
    </span>
  )
}

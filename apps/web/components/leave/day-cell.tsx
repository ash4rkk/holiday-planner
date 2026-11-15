'use client'

import { cx } from '@/components/ui'
import type { DayIndex } from './model'

/** Znaczki świąt: Polska pełna kropka, Brandenburgia pusty krążek (ten sam kolor, bez stanów). */
export function HolidayMarks({ marks }: { marks: { region: string }[] }) {
  return (
    <>
      {marks.map((h) => (
        <span
          key={h.region}
          aria-hidden="true"
          className={cx(
            'inline-block size-1.5 rounded-full',
            h.region === 'PL' ? 'bg-lavender' : 'border border-lavender',
          )}
        />
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
}: {
  date: string
  index: DayIndex
  today: string
  picking: string | null
  onPick: (date: string) => void
}) {
  const period = index.period(date)
  const holidays = index.holidays(date)
  const trips = index.trips(date)
  const events = index.events(date)
  const off = index.off(date)
  const title = dayTitle(date, index)
  return (
    <button
      type="button"
      onClick={() => onPick(date)}
      title={title || undefined}
      aria-label={`${Number(date.slice(8))}${period ? ', urlop' : ''}${title ? `, ${title}` : ''}`}
      className={cx(
        'relative flex aspect-square min-w-0 flex-col items-center justify-center rounded-small text-xs tabular-nums',
        period ? 'bg-active font-bold text-text' : off ? 'text-subtle' : 'text-text',
        picking === date && 'ring-1 ring-accent',
        date === today && 'outline outline-1 -outline-offset-1 outline-sel',
        'hover:text-accent',
      )}
    >
      <span>{Number(date.slice(8))}</span>
      <span className="flex h-1.5 items-center gap-0.5">
        <HolidayMarks marks={holidays} />
        {events.length > 0 && (
          <span
            aria-hidden="true"
            className="inline-block size-1 rounded-full bg-muted opacity-50"
          />
        )}
      </span>
      {trips.length > 0 && (
        <span aria-hidden="true" className="absolute inset-x-1 bottom-0.5 h-px bg-muted" />
      )}
    </button>
  )
}

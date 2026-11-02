'use client'

import {
  CARD_STATUS_LABELS,
  CARD_STATUSES,
  CARD_TYPE_LABELS,
  CARD_TYPES,
  type CardSnapshot,
  type CardStatus,
  type CardType,
  createCard,
  formatDateSpan,
  formatDayHeader,
  formatShortDate,
  groupCardsByDay,
  restoreCard,
  todayLocal,
} from '@planer/core'
import { Plus, Settings2 } from 'lucide-react'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { CardSheet } from '@/components/card/card-sheet'
import { CardTile } from '@/components/card/card-tile'
import { TYPE_STYLE } from '@/components/card/type-style'
import { useNavHidden } from '@/components/nav/nav-context'
import { TopBar } from '@/components/top-bar'
import { cx, SectionLabel } from '@/components/ui'
import { useCardSheet } from '@/lib/use-card-sheet'
import { useCards, useTrip } from '@/lib/yjs/trip-doc'

export function TripList() {
  const { trip, doc, ready } = useTrip()
  const cards = useCards()
  const { openId, isNew, open, close } = useCardSheet()
  const [types, setTypes] = useState<Set<CardType>>(new Set())
  const [statuses, setStatuses] = useState<Set<CardStatus>>(new Set())
  const [showTrash, setShowTrash] = useState(false)
  const hidden = useNavHidden()
  const today = todayLocal()

  const filtered = useMemo(
    () =>
      cards.filter(
        (c) =>
          (!types.size || types.has(c.type)) &&
          (!statuses.size || (c.status && statuses.has(c.status))),
      ),
    [cards, types, statuses],
  )
  const groups = useMemo(() => groupCardsByDay(filtered, trip), [filtered, trip])

  const add = (date?: string) => {
    const id = createCard(doc, { type: 'note', ...(date && { date }) })
    open(id, true)
  }

  const toggle = <T,>(set: Set<T>, value: T, update: (s: Set<T>) => void) => {
    const next = new Set(set)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    update(next)
  }

  const tile = (c: CardSnapshot) => <CardTile key={c.id} card={c} onOpen={() => open(c.id)} />
  const live = cards.filter((c) => !c.deletedAt).length

  return (
    <>
      {/* Pod otwartym arkuszem lista jest nieaktywna (fokus i czytniki ekranu zostają w arkuszu). */}
      <main inert={!!openId} className="mx-auto flex max-w-xl flex-col gap-1">
        <TopBar
          title={trip.title}
          subtitle={formatDateSpan(trip.startDate, trip.endDate)}
          actions={
            <Link
              href={`/trips/${trip.id}/settings`}
              aria-label="ustawienia wyjazdu"
              className="island flex size-11 shrink-0 items-center justify-center text-muted hover:text-accent"
            >
              <Settings2 className="size-5" aria-hidden="true" />
            </Link>
          }
        />

        <div
          className="-mx-0.5 flex gap-1 overflow-x-auto px-0.5 py-1"
          role="group"
          aria-label="filtry"
        >
          {CARD_TYPES.map((t) => {
            const Icon = TYPE_STYLE[t].icon
            const on = types.has(t)
            return (
              <button
                key={t}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(types, t, setTypes)}
                className={cx(
                  'flex min-h-9 shrink-0 items-center gap-1 rounded-small border px-2 text-xs transition-colors',
                  on ? 'border-accent bg-accent/20 text-accent' : 'border-line bg-panel text-muted',
                )}
              >
                <Icon className={cx('size-3.5', !on && TYPE_STYLE[t].text)} aria-hidden="true" />
                {CARD_TYPE_LABELS[t]}
              </button>
            )
          })}
          <span className="mx-1 w-px shrink-0 bg-line" />
          {CARD_STATUSES.map((s) => {
            const on = statuses.has(s)
            return (
              <button
                key={s}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(statuses, s, setStatuses)}
                className={cx(
                  'min-h-9 shrink-0 rounded-small border px-2 text-xs transition-colors',
                  on ? 'border-accent bg-accent/20 text-accent' : 'border-line bg-panel text-muted',
                )}
              >
                {CARD_STATUS_LABELS[s]}
              </button>
            )
          })}
        </div>

        {ready && live === 0 && (
          <p className="island p-4 text-sm text-muted">
            ● brak kart — dodaj pierwszą przyciskiem +
          </p>
        )}

        {groups.pinned.length > 0 && (
          <section className="flex flex-col gap-1">
            <SectionLabel>⌖ przypięte</SectionLabel>
            {groups.pinned.map(tile)}
          </section>
        )}

        {groups.days.map((day) => {
          const isToday = day.date === today
          return (
            <section
              key={day.date}
              className="flex flex-col gap-1"
              aria-label={formatDayHeader(day.date)}
            >
              <div className="flex items-center gap-2 pt-3 pl-3">
                <h2 className={cx('text-sm font-bold', isToday && 'text-accent')}>
                  {formatDayHeader(day.date)}
                </h2>
                <span className="text-xs text-subtle italic">
                  {[isToday && 'dziś', day.dayIndex && `dzień ${day.dayIndex}`]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
                <button
                  type="button"
                  onClick={() => add(day.date)}
                  aria-label={`dodaj kartę na ${formatShortDate(day.date)}`}
                  className="ml-auto flex size-11 items-center justify-center text-muted hover:text-accent"
                >
                  <Plus className="size-4" aria-hidden="true" />
                </button>
              </div>
              {day.cards.length ? (
                day.cards.map(tile)
              ) : (
                <p className="px-3 text-xs text-dim italic">pusto</p>
              )}
            </section>
          )
        })}

        {groups.undated.length > 0 && (
          <section className="flex flex-col gap-1">
            <SectionLabel>bez daty</SectionLabel>
            {groups.undated.map(tile)}
          </section>
        )}

        {groups.trash.length > 0 && (
          <section className="mt-4 flex flex-col gap-1">
            <button
              type="button"
              onClick={() => setShowTrash((v) => !v)}
              aria-expanded={showTrash}
              className="px-3 py-2 text-left text-xs text-subtle italic"
            >
              kosz ({groups.trash.length}) {showTrash ? '·' : '›'} karty znikają po 30 dniach
            </button>
            {showTrash &&
              groups.trash.map((c) => (
                <div key={c.id} className="island flex items-center gap-3 px-4 py-2">
                  <span className="min-w-0 flex-1 truncate text-sm text-subtle">
                    {c.title || 'bez tytułu'}
                  </span>
                  <button
                    type="button"
                    onClick={() => restoreCard(doc, c.id)}
                    className="min-h-11 px-2 text-xs text-accent"
                  >
                    przywróć
                  </button>
                </div>
              ))}
          </section>
        )}

        <button
          type="button"
          onClick={() => add()}
          aria-label="nowa karta"
          className={cx(
            'fixed right-3 bottom-[calc(76px+env(safe-area-inset-bottom))] z-30 flex size-14 items-center justify-center',
            'rounded-island bg-accent text-on-accent transition-transform duration-200 hover:bg-accent-hover',
            'motion-reduce:transition-none',
            hidden && 'translate-y-[calc(100%+90px)]',
          )}
        >
          <Plus className="size-6" aria-hidden="true" />
        </button>
      </main>
      {openId && <CardSheet key={openId} cardId={openId} isNew={isNew} onClose={close} />}
    </>
  )
}

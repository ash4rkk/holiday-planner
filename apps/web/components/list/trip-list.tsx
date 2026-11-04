'use client'

import {
  CARD_STATUS_LABELS,
  CARD_STATUSES,
  CARD_TYPE_LABELS,
  CARD_TYPES,
  type CardSnapshot,
  type CardStatus,
  type CardType,
  cardIsPast,
  createCard,
  type DayGap,
  formatDayHeader,
  formatShortDate,
  groupCardsByDay,
  moveCardToDay,
  restoreCard,
  todayLocal,
} from '@planer/core'
import { Lightbulb, Luggage, Plus, Settings2 } from 'lucide-react'
import Link from 'next/link'
import { Fragment, type ReactNode, useMemo, useState } from 'react'
import { AddButton } from '@/components/add-button'
import { ChatButton } from '@/components/ai/chat-panel'
import { DraftReview, ImportRunner, ImportStatus } from '@/components/ai/import-ui'
import { TotalsText } from '@/components/amounts'
import { CardSheet } from '@/components/card/card-sheet'
import { CardTile } from '@/components/card/card-tile'
import { DayTravelSummary, LegRow } from '@/components/card/leg-row'
import { StatusMark } from '@/components/card/status-mark'
import { TYPE_STYLE } from '@/components/card/type-style'
import { InboxButton } from '@/components/inbox/inbox-button'
import { TopBar, TRIPS_BACK } from '@/components/top-bar'
import { SessionBanner, TripStatus } from '@/components/trip-status'
import { buttonClass, cx, SectionLabel } from '@/components/ui'
import { DayWeather } from '@/components/weather'
import { enqueueImport, runImports } from '@/lib/ai-import'
import { countByCard } from '@/lib/attachment-counts'
import { createFromTemplate } from '@/lib/card-templates'
import { pasteAsCard } from '@/lib/place-card'
import { useCardSheet } from '@/lib/use-card-sheet'
import { useDayPlans } from '@/lib/use-day-plans'
import { useTripNow } from '@/lib/use-trip-now'
import { useAttachments, useCards, useTrip } from '@/lib/yjs/trip-doc'

export function TripList() {
  const { trip, user, doc, ready, templates } = useTrip()
  // Waluta główna wyjazdu (pierwsza z listy); bez walut — same złotówki.
  const main = trip.currencies[0] ?? 'PLN'
  const cards = useCards()
  const attachments = useAttachments()
  const fileCounts = useMemo(() => countByCard(attachments), [attachments])
  const { openId, isNew, open, close } = useCardSheet()
  const [types, setTypes] = useState<Set<CardType>>(new Set())
  const [statuses, setStatuses] = useState<Set<CardStatus>>(new Set())
  const [showTrash, setShowTrash] = useState(false)
  const [moving, setMoving] = useState<CardSnapshot | null>(null)
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

  const tile = (c: CardSnapshot) => (
    <CardTile
      key={c.id}
      card={c}
      files={fileCounts.get(c.id)}
      onOpen={() => open(c.id)}
      onHold={() => setMoving(c)}
    />
  )
  const live = cards.filter((c) => !c.deletedAt).length

  return (
    <>
      {/* Pod otwartym arkuszem lista jest nieaktywna (fokus i czytniki ekranu zostają w arkuszu). */}
      <main inert={!!openId} className="mx-auto flex max-w-xl flex-col gap-1">
        <TopBar
          theme={false}
          title={trip.title}
          back={TRIPS_BACK}
          morph={`trip-${trip.id}`}
          profile={user.name}
          actions={
            <>
              <TripStatus />
              <ChatButton onOpenCard={(id) => open(id)} />
              <InboxButton />
              <Link
                href={`/trips/${trip.id}/settings`}
                aria-label="ustawienia wyjazdu"
                className="island flex size-11 shrink-0 items-center justify-center text-muted hover:text-accent"
              >
                <Settings2 className="size-5" aria-hidden="true" />
              </Link>
            </>
          }
        />

        <SessionBanner />

        <div
          className="relative mt-1 flex w-fit max-w-full items-center self-center overflow-x-auto rounded-island border border-line bg-panel p-1"
          role="group"
          aria-label="filtry"
        >
          {CARD_TYPES.map((t) => {
            const Icon = TYPE_STYLE[t].icon
            return (
              <FilterChip
                key={t}
                label={CARD_TYPE_LABELS[t]}
                on={types.has(t)}
                onClick={() => toggle(types, t, setTypes)}
              >
                <Icon
                  className={cx('size-5', !types.has(t) && TYPE_STYLE[t].text)}
                  aria-hidden="true"
                  strokeWidth={1.8}
                />
              </FilterChip>
            )
          })}
          <span className="mx-1 h-6 w-px shrink-0 bg-line" />
          {CARD_STATUSES.map((s) => (
            <FilterChip
              key={s}
              label={CARD_STATUS_LABELS[s]}
              on={statuses.has(s)}
              onClick={() => toggle(statuses, s, setStatuses)}
            >
              {s === 'idea' ? (
                <Lightbulb className="size-5" aria-hidden="true" strokeWidth={1.8} />
              ) : (
                <StatusMark status={s} />
              )}
            </FilterChip>
          ))}
        </div>

        {cards.some((c) => !c.deletedAt && c.amounts?.length) && (
          <p className="px-3 text-xs text-subtle italic">
            wydatki wyjazdu ·{' '}
            <TotalsText cards={cards} mainCurrency={main} className="not-italic font-bold" />
          </p>
        )}

        {ready && live === 0 && (
          <section className="island pop-in flex flex-col items-center gap-2 p-6 text-center">
            <span className="flex size-16 items-center justify-center rounded-full border border-dashed border-teal text-teal">
              <Luggage className="size-7" aria-hidden="true" strokeWidth={1.5} />
            </span>
            <p className="font-bold">pusty plan</p>
            <p className="text-sm text-muted">dodaj pierwszą kartę albo wklej link z Map Google</p>
            <button type="button" onClick={() => add()} className={buttonClass('primary', 'mt-1')}>
              + pierwsza karta
            </button>
          </section>
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
                <DayWeather date={day.date} cards={cards} className="shrink-0" />
                <h2 className={cx('truncate text-sm font-bold', isToday && 'text-accent')}>
                  {formatDayHeader(day.date)}
                </h2>
                <span className="shrink-0 text-xs text-subtle italic">
                  {[isToday && 'dziś', day.dayIndex && `dzień ${day.dayIndex}`]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
                <span className="flex-1" />
                <button
                  type="button"
                  onClick={() => add(day.date)}
                  aria-label={`dodaj kartę na ${formatShortDate(day.date)}`}
                  className="flex size-11 items-center justify-center text-muted hover:text-accent"
                >
                  <Plus className="size-4" aria-hidden="true" />
                </button>
              </div>
              <TotalsText cards={day.cards} mainCurrency={main} className="-mt-2 px-3 text-xs" />
              {day.cards.length > 0 && <DayCards date={day.date} cards={day.cards} tile={tile} />}
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

        <AddButton
          onNew={() => add()}
          templates={templates}
          onImport={(files) =>
            void enqueueImport(trip.id, files).then(() => runImports(trip.id, doc))
          }
          onTemplate={(t) => open(createFromTemplate(doc, t), true)}
          onPaste={async () => {
            const id = await pasteAsCard(doc)
            if (id) open(id)
          }}
        />
        <ImportRunner />
        <ImportStatus />
        <DraftReview onEdit={(id) => open(id)} />
      </main>
      {openId && <CardSheet key={openId} cardId={openId} isNew={isNew} onClose={close} />}
      {moving && (
        <MoveSheet
          card={moving}
          days={groups.days.map((d) => d.date)}
          onPick={(date) => {
            moveCardToDay(doc, moving.id, date)
            setMoving(null)
          }}
          onClose={() => setMoving(null)}
        />
      )}
    </>
  )
}

/** Karty dnia na osi: między nimi dojazdy, ostrzeżenia, wyjście z noclegu i powrót. */
function DayCards({
  date,
  cards,
  tile,
}: {
  date: string
  cards: CardSnapshot[]
  tile: (c: CardSnapshot) => ReactNode
}) {
  const { trip } = useTrip()
  const { legs, plans, limited, refresh } = useDayPlans(date)
  const now = useTripNow()
  // Linia „teraz” przed pierwszą kartą, której pora jeszcze nie minęła.
  const timed = cards.filter((c) => c.time)
  const upcoming = now && timed.find((c) => (c.time as string) > now.time)
  const lineBefore = now?.date === date && upcoming ? upcoming.id : undefined
  const lineAtEnd = now?.date === date && !upcoming && timed.length > 0
  const endLeg = legs.find((l) => l.kind === 'end')
  const row = (leg: DayGap | undefined) =>
    leg && (
      <LegRow
        leg={leg}
        date={date}
        plan={plans[leg.id]}
        bufferMin={trip.travelBufferMin}
        onRefresh={refresh}
      />
    )

  return (
    <div className="flex flex-col gap-1">
      <div className="day-rail flex flex-col gap-1">
        {row(legs.find((l) => l.kind === 'start'))}
        {cards.map((c) => (
          <Fragment key={c.id}>
            {lineBefore === c.id && now && <NowLine time={now.time} />}
            <div
              className={cx(
                'relative transition-opacity duration-500',
                now && cardIsPast(c, now) && 'opacity-60',
              )}
            >
              <span
                aria-hidden="true"
                className={cx(
                  'absolute top-5 -left-[12px] size-2 rounded-full',
                  TYPE_STYLE[c.type].bar,
                )}
              />
              {tile(c)}
            </div>
            {/* Powrót do noclegu jest jeszcze przed Wami, więc „teraz” stoi nad nim. */}
            {lineAtEnd && now && endLeg?.from === c.id && <NowLine time={now.time} />}
            {row(legs.find((l) => l.from === c.id))}
          </Fragment>
        ))}
        {lineAtEnd && now && !endLeg && <NowLine time={now.time} />}
      </div>
      <DayTravelSummary plans={plans} limited={limited} />
    </div>
  )
}

/** Filtr jak pozycja menu dolnego: sama ikona, po włączeniu wysuwa się nazwa. */
function FilterChip({
  label,
  on,
  onClick,
  children,
}: {
  label: string
  on: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={label}
      title={label}
      onClick={(e) => {
        onClick()
        // Nazwa wysuwa się 200 ms; bez tego przy końcu paska zostałaby poza krawędzią.
        const chip = e.currentTarget
        setTimeout(() => chip.scrollIntoView({ inline: 'nearest', block: 'nearest' }), 220)
      }}
      className={cx(
        'flex h-11 min-w-11 shrink-0 items-center justify-center rounded-[9px] transition-colors',
        on ? 'bg-accent/20 px-3 text-accent' : 'text-muted hover:text-text',
      )}
    >
      {children}
      <span
        className={cx(
          'overflow-hidden text-sm font-bold whitespace-nowrap transition-[max-width,margin] duration-200',
          on ? 'ml-2 max-w-32' : 'max-w-0',
        )}
      >
        {label}
      </span>
    </button>
  )
}

function NowLine({ time }: { time: string }) {
  return (
    <div
      className="flex items-center gap-2 text-[11px] font-bold text-accent"
      aria-label={`teraz ${time}`}
    >
      <span className="h-0.5 flex-1 rounded-full bg-accent" />
      teraz {time}
    </div>
  )
}

/** Przytrzymanie karty: wybór dnia. Godzina zostaje, nocleg zachowuje liczbę nocy. */
function MoveSheet({
  card,
  days,
  onPick,
  onClose,
}: {
  card: CardSnapshot
  days: string[]
  onPick: (date: string | undefined) => void
  onClose: () => void
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="przenieś kartę"
      className="fade-in fixed inset-0 z-50 flex flex-col justify-end bg-bg/70"
    >
      <button type="button" aria-label="anuluj" onClick={onClose} className="min-h-12 flex-1" />
      <section className="island sheet-in mx-0.5 mb-0.5 flex max-h-[70dvh] flex-col overflow-hidden">
        <h2 className="truncate border-b border-line px-4 py-3 text-sm font-bold">
          przenieś: {card.title || 'bez tytułu'}
        </h2>
        <div className="flex flex-col overflow-y-auto p-1">
          {days.map((date) => (
            <button
              key={date}
              type="button"
              disabled={date === card.date}
              onClick={() => onPick(date)}
              className="flex min-h-11 items-center rounded-[9px] px-3 text-left text-sm hover:bg-raised disabled:text-accent"
            >
              {formatDayHeader(date)}
              {date === card.date && ' · teraz'}
            </button>
          ))}
          <button
            type="button"
            disabled={!card.date}
            onClick={() => onPick(undefined)}
            className="flex min-h-11 items-center rounded-[9px] px-3 text-left text-sm text-muted hover:bg-raised"
          >
            bez daty
          </button>
        </div>
      </section>
    </div>
  )
}

'use client'

import {
  arrivalClock,
  CARD_TYPE_LABELS,
  type CardSnapshot,
  type DayGap,
  daysBetween,
  formatAmount,
  hasCoords,
  type LatLng,
  type LegPlan,
  lateBy,
  legIsPast,
  type MappedCard,
  navigationUrl,
  nextPlace,
  shiftClock,
  staysOver,
  stayTimes,
  TRAVEL_MODE_LABELS,
  todayLocal,
  weatherPlace,
} from '@planer/core'
import { LocateFixed, Navigation } from 'lucide-react'
import Link from 'next/link'
import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import type { PlanResponse } from '@/app/api/route/plan/route'
import type { Route } from '@/app/api/route/route'
import { ChatButton } from '@/components/ai/chat-panel'
import { TotalsText } from '@/components/amounts'
import { fieldsSummary } from '@/components/card/card-fields'
import { CardSheet } from '@/components/card/card-sheet'
import { DayTravelSummary, LegRow } from '@/components/card/leg-row'
import { TYPE_STYLE } from '@/components/card/type-style'
import { SearchButton } from '@/components/search/search-button'
import { CountdownRing } from '@/components/today/countdown-ring'
import { DayAxis } from '@/components/today/day-axis'
import { TopBar, TRIPS_BACK } from '@/components/top-bar'
import { TripMenu, TripTitle } from '@/components/trip-menu'
import { SessionBanner, TripStatus } from '@/components/trip-status'
import { cx, SectionLabel } from '@/components/ui'
import { useWeather, weatherIcon } from '@/components/weather'
import { useCardSheet } from '@/lib/use-card-sheet'
import { useDayPlans } from '@/lib/use-day-plans'
import { useFetchCached } from '@/lib/use-fetch-cached'
import { locate, usePosition } from '@/lib/use-position'
import { useCards, useTrip } from '@/lib/yjs/trip-doc'

const nowHHMM = (d = new Date()) =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

function daysLabel(n: number) {
  return n === 1 ? 'jutro' : `za ${n} dni`
}

/**
 * „Dziś” wyjazdu. W trakcie: oś dnia, następne miejsce z dojazdem, pogoda, wydatki dzisiaj.
 * Przed wyjazdem: odliczanie i plan pierwszego dnia. Po wyjeździe: wydatki całego wyjazdu.
 */
export function TodayDashboard({ userName }: { userName: string }) {
  const { trip } = useTrip()
  // Pisanie w otwartej karcie ma pierwszeństwo; widok pod nią nadąża chwilę później.
  const cards = useDeferredValue(useCards())
  const sheet = useCardSheet()
  const today = todayLocal()
  const [now, setNow] = useState(nowHHMM())
  useEffect(() => {
    const t = setInterval(() => setNow(nowHHMM()), 60_000)
    return () => clearInterval(t)
  }, [])

  const live = useMemo(() => cards.filter((c) => !c.deletedAt), [cards])
  const { startDate, endDate } = trip
  const before = Boolean(startDate && today < startDate)
  const after = Boolean(endDate && today > endDate)
  const during = Boolean(startDate) && !before && !after
  // Plan: dziś, a przed wyjazdem pierwszy dzień.
  const planDate = before && startDate ? startDate : today
  const todays = useMemo(
    () =>
      live
        .filter((c) => c.date === planDate)
        .sort(
          (a, b) =>
            (a.time ?? '').localeCompare(b.time ?? '') || a.createdAt.localeCompare(b.createdAt),
        ),
    [live, planDate],
  )
  const stay = during ? live.filter(hasCoords).find((c) => staysOver(c, today)) : undefined
  const next = during ? nextPlace(live, today, now) : undefined
  const main = trip.currencies[0] ?? 'PLN'
  const place = weatherPlace(cards, planDate)
  const weather = useWeather(place)
  const { legs, plans, limited, refresh } = useDayPlans(after ? null : planDate)
  const stays = stayTimes(todays, legs, plans, trip.travelBufferMin)
  // Minione dojazdy są schowane, ale po zmianie planu w trasie można je odsłonić.
  const [showPast, setShowPast] = useState(false)
  const isPast = (leg: (typeof legs)[number]) =>
    legIsPast(leg, planDate, { date: today, time: now }, live)
  const hiddenLegs = legs.filter(isPast).length
  const legRow = (leg: (typeof legs)[number] | undefined) =>
    leg &&
    (showPast || !isPast(leg)) && (
      <LegRow
        leg={leg}
        date={planDate}
        plan={plans[leg.id]}
        bufferMin={trip.travelBufferMin}
        onRefresh={refresh}
      />
    )
  const nextLeg = next && legs.find((l) => l.to === next.id)
  // Dojazd do miejsca w podglądzie osi: „17 min pieszo · wyjdź do 20:03”.
  const legText = (id: string) => {
    const leg = legs.find((l) => l.to === id)
    const plan = leg && plans[leg.id]
    if (!leg || !plan) return undefined
    const leave = leg.arriveBy
      ? shiftClock(plan.departAt ?? shiftClock(leg.arriveBy, -plan.minutes), -trip.travelBufferMin)
      : undefined
    return [`${plan.minutes} min ${TRAVEL_MODE_LABELS[plan.mode]}`, leave && `wyjdź do ${leave}`]
      .filter(Boolean)
      .join(' · ')
  }
  const tripDays = startDate && endDate ? daysBetween(startDate, endDate) + 1 : undefined
  const dayNumber = during && startDate ? daysBetween(startDate, today) + 1 : undefined
  const status = dayNumber
    ? `dzień ${dayNumber}${tripDays ? ` z ${tripDays}` : ''}`
    : before
      ? daysLabel(daysBetween(today, startDate as string))
      : after
        ? 'wyjazd zakończony'
        : 'bez dat'

  return (
    <>
      <TopBar
        title={<TripTitle />}
        back={TRIPS_BACK}
        morph={`trip-${trip.id}`}
        menu={<TripMenu />}
        actions={
          <>
            <SearchButton onOpenCard={(id) => sheet.open(id)} />
            <ChatButton onOpenCard={(id) => sheet.open(id)} />
            <TripStatus />
          </>
        }
      />
      <SessionBanner />

      {during ? (
        <>
          {next && (
            <NextPlace
              card={next}
              from={stay}
              leg={nextLeg}
              plan={nextLeg && plans[nextLeg.id]}
              now={now}
              onOpen={() => sheet.open(next.id)}
            />
          )}
          <section className="island flex flex-col gap-3 p-3" aria-label="dzień">
            <div className="flex items-baseline justify-between gap-2">
              <p className="min-w-0 truncate text-sm">
                <span className="font-bold">{weekday(planDate)}</span>
                <span className="text-subtle italic"> · {status}</span>
              </p>
              <Link href={`/trips/${trip.id}/list`} className="shrink-0 text-xs text-accent">
                lista ›
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-1">
              <WeatherTile at={place} today={planDate} compact />
              <div className="flex flex-col justify-center rounded-small bg-raised px-3 py-2">
                <p className="text-xs text-subtle italic">wydatki dzisiaj</p>
                {todays.some((c) => c.amounts?.length) ? (
                  <TotalsText cards={todays} mainCurrency={main} className="text-sm font-bold" />
                ) : (
                  <p className="text-sm text-dim">{formatAmount({ value: 0, currency: 'PLN' })}</p>
                )}
              </div>
            </div>
            {todays.some((c) => c.time) && (
              <DayAxis cards={todays} now={now} onOpen={(id) => sheet.open(id)} legText={legText} />
            )}
            {stay && (
              <p className="text-xs text-subtle italic">
                nocleg: {stay.title || stay.location.name}
              </p>
            )}
          </section>
        </>
      ) : (
        <>
          <section
            className={cx(
              'island overflow-hidden border-t-2 border-t-accent p-4 transition-colors duration-500',
              heroTone(weather?.current?.code),
            )}
          >
            <p className="text-xl font-bold">cześć, {userName}</p>
            <p className="mt-1 text-sm text-muted">
              {status} ·{' '}
              <Link href={`/trips/${trip.id}/list`} className="text-accent">
                lista ›
              </Link>
            </p>
            {stay && (
              <p className="mt-1 text-xs text-subtle italic">
                nocleg: {stay.title || stay.location.name}
              </p>
            )}
            {dayNumber && tripDays && (
              <div className="mt-3 h-1 overflow-hidden rounded-full bg-raised" aria-hidden="true">
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-500"
                  style={{ width: `${Math.min(100, (dayNumber / tripDays) * 100)}%` }}
                />
              </div>
            )}
          </section>

          <div className="grid grid-cols-2 gap-1">
            {(during || place) && !after && <WeatherTile at={place} today={planDate} />}
            <section
              className={cx(
                'island flex flex-col justify-center p-3',
                (after || (!during && !place)) && 'col-span-2',
              )}
            >
              <p className="text-xs text-subtle italic">
                {during ? 'wydatki dzisiaj' : 'wydatki wyjazdu'}
              </p>
              {(during ? todays : live).some((c) => c.amounts?.length) ? (
                <TotalsText
                  cards={during ? todays : live}
                  mainCurrency={main}
                  className="text-sm font-bold"
                />
              ) : (
                <p className="text-sm text-dim">{formatAmount({ value: 0, currency: 'PLN' })}</p>
              )}
            </section>
          </div>
        </>
      )}

      {!after && <SectionLabel>{before ? 'pierwszy dzień' : 'plan dnia'}</SectionLabel>}
      {after ? null : todays.length === 0 ? (
        <p className="island p-4 text-sm text-muted">
          ● {before ? 'na pierwszy dzień' : 'na dziś'} nic nie zaplanowano
        </p>
      ) : (
        <ol className="island flex flex-col p-2" aria-label="plan dnia">
          {legRow(legs.find((l) => l.kind === 'start'))}
          {todays.map((card, i) => {
            const prev = todays[i - 1]
            // Kreska „teraz” między ostatnią minioną a pierwszą przyszłą pozycją z godziną.
            const nowLine =
              during && card.time && card.time > now && (!prev?.time || prev.time <= now)
            return (
              <li key={card.id}>
                {nowLine && (
                  <div
                    className="my-1 flex items-center gap-2 px-2 text-2xs font-bold text-accent"
                    aria-label={`teraz ${now}`}
                  >
                    <span className="h-0.5 flex-1 bg-accent" />
                    teraz {now}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => sheet.open(card.id)}
                  className={cx(
                    'flex w-full items-start gap-3 rounded-inner px-2 py-2 text-left hover:bg-raised',
                    during && card.time && card.time < now && 'opacity-60',
                    card.skipped && 'line-through opacity-50',
                  )}
                >
                  <span className="w-12 shrink-0 pt-0.5 text-right text-xs font-bold text-subtle">
                    {card.time ?? 'cały dzień'}
                  </span>
                  <span
                    className={cx(
                      'mt-1.5 size-2.5 shrink-0 rounded-full',
                      TYPE_STYLE[card.type].bar,
                    )}
                    title={CARD_TYPE_LABELS[card.type]}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">{card.title || 'bez tytułu'}</span>
                    <span className="block truncate text-xs text-subtle italic">
                      {[
                        fieldsSummary({ ...card, time: undefined }),
                        card.location?.name && `⌖ ${card.location.name}`,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                    {stays.has(card.id) && (
                      <span className="block text-xs text-teal">
                        możesz zostać do {stays.get(card.id)}
                      </span>
                    )}
                  </span>
                </button>
                {legRow(legs.find((l) => l.from === card.id))}
              </li>
            )
          })}
        </ol>
      )}

      {hiddenLegs > 0 && (
        <button
          type="button"
          onClick={() => setShowPast((v) => !v)}
          aria-expanded={showPast}
          className="min-h-11 px-3 text-left text-xs text-subtle italic"
        >
          {showPast ? 'ukryj minione dojazdy' : `pokaż minione dojazdy (${hiddenLegs})`}
        </button>
      )}
      {!after && <DayTravelSummary plans={plans} limited={limited} />}

      {sheet.openId && (
        <CardSheet cardId={sheet.openId} isNew={sheet.isNew} onClose={sheet.close} />
      )}
    </>
  )
}

type Check =
  | { state: 'idle' | 'busy' | 'denied' | 'failed' }
  | { state: 'done'; plan: LegPlan; now: string }

/** „Zdążę?”: trasa z miejsca, w którym jesteś, liczona dopiero po naciśnięciu przycisku. */
function CanWeMakeIt({ card }: { card: MappedCard }) {
  const { trip } = useTrip()
  const [check, setCheck] = useState<Check>({ state: 'idle' })

  const run = async () => {
    setCheck({ state: 'busy' })
    const here = await locate().catch(() => null)
    if (!here) return setCheck({ state: 'denied' })
    const res = await fetch('/api/route/plan', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tripId: trip.id,
        date: todayLocal(),
        live: true,
        legs: [
          {
            id: 'here',
            from: here,
            to: { lat: card.location.lat, lng: card.location.lng },
          },
        ],
      }),
    }).catch(() => null)
    const body = res?.ok ? ((await res.json()) as PlanResponse) : null
    const plan = body?.plans.here
    if (!plan || !body?.now) return setCheck({ state: 'failed' })
    setCheck({ state: 'done', plan, now: body.now })
  }

  const ride = check.state === 'done' && check.plan.steps.find((s) => s.kind === 'transit')
  const arrival = check.state === 'done' ? arrivalClock(check.plan, check.now) : undefined
  const late = arrival && card.time ? lateBy(arrival, card.time) : undefined

  return (
    <div className="mt-2 text-sm">
      {check.state === 'done' && (
        <div className="pop-in mb-1 rounded-small bg-raised p-2">
          <p>
            Jesteś {check.plan.minutes} min {TRAVEL_MODE_LABELS[check.plan.mode]} stąd
            {ride && `, ${[ride.vehicle, ride.line].filter(Boolean).join(' ')} o ${ride.departs}`}.{' '}
            Będziesz o {arrival}.
          </p>
          {late !== undefined && (
            <p className={cx('font-bold', late > 0 ? 'text-red' : 'text-green')}>
              {late > 0 ? `● spóźnienie ${late} min` : `• zdążysz, ${-late} min zapasu`}
            </p>
          )}
          {check.plan.noService && <p className="text-red">● komunikacją już nic nie jedzie</p>}
        </div>
      )}
      <button
        type="button"
        onClick={() => void run()}
        disabled={check.state === 'busy'}
        className="flex min-h-11 w-full items-center justify-center gap-1 rounded-small border border-line text-accent disabled:opacity-50"
      >
        <LocateFixed className="size-4" aria-hidden="true" />
        {check.state === 'busy'
          ? 'sprawdzam…'
          : check.state === 'done'
            ? 'sprawdź ponownie'
            : 'zdążę stąd?'}
      </button>
      {check.state === 'denied' && (
        <p className="mt-1 text-xs text-red">● brak dostępu do lokalizacji telefonu</p>
      )}
      {check.state === 'failed' && (
        <p className="mt-1 text-xs text-red">● nie udało się sprawdzić trasy</p>
      )}
    </div>
  )
}

/** Delikatne tło powitania zależne od pogody. */
function heroTone(code: number | undefined): string | undefined {
  if (code === undefined) return undefined
  if (code <= 2) return 'bg-amber/10'
  if (code <= 48) return 'bg-blue/10'
  return 'bg-teal/15'
}

const weekdayFormat = new Intl.DateTimeFormat('pl-PL', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
})
/** „sobota, 7 listopada” z daty ISO. */
const weekday = (date: string) => weekdayFormat.format(new Date(`${date}T12:00:00Z`))

function WeatherTile({
  at,
  today,
  compact,
}: {
  at?: LatLng
  today: string
  /** Wewnątrz karty dnia: tło `raised` zamiast osobnej wysepki. */
  compact?: boolean
}) {
  const { position, request, denied } = usePosition()
  const place = at ?? position
  const weather = useWeather(place)
  const day = weather?.daily.find((d) => d.date === today)

  if (!place) {
    return (
      <button
        type="button"
        onClick={request}
        disabled={denied}
        className={cx(
          'flex flex-col justify-center text-left',
          compact ? 'rounded-small bg-raised px-3 py-2' : 'island p-3',
        )}
      >
        <span className="text-xs text-subtle italic">pogoda</span>
        <span className="flex items-center gap-1 text-sm text-accent">
          <LocateFixed className="size-4" aria-hidden="true" />
          {denied ? 'brak zgody na pozycję' : 'użyj mojej pozycji'}
        </span>
      </button>
    )
  }
  const code = weather?.current?.code ?? day?.code
  const { icon: Icon, label } = weatherIcon(code ?? 0)
  return (
    <section
      className={cx(
        'flex items-center gap-3',
        compact ? 'rounded-small bg-raised px-3 py-2' : 'island p-3',
      )}
      aria-label={`pogoda: ${label}`}
    >
      <Icon
        className={cx('shrink-0 text-amber', compact ? 'size-6' : 'size-7')}
        aria-hidden="true"
      />
      <div>
        <p className="text-lg font-bold leading-tight">
          {weather?.current ? `${Math.round(weather.current.temp)}°` : '—'}
        </p>
        {day && (
          <p className="text-xs text-subtle">
            {Math.round(day.max)}° / {Math.round(day.min)}° · {label}
          </p>
        )}
      </div>
    </section>
  )
}

function NextPlace({
  card,
  from,
  leg,
  plan,
  now,
  onOpen,
}: {
  card: MappedCard
  from?: MappedCard
  leg?: DayGap
  plan?: LegPlan | null
  now: string
  onOpen: () => void
}) {
  const { trip } = useTrip()
  const { position } = usePosition()
  // Skąd: bieżąca pozycja, a bez niej nocleg (rano zwykle stamtąd).
  const origin = position ?? (from ? { lat: from.location.lat, lng: from.location.lng } : undefined)
  const url = origin
    ? `/api/route?from=${origin.lat.toFixed(5)},${origin.lng.toFixed(5)}&to=${card.location.lat.toFixed(5)},${card.location.lng.toFixed(5)}`
    : null
  const route = useFetchCached<Route>(url, 10 * 60_000)
  const walk = route?.foot
  const travel = walk
    ? walk.minutes <= 45 || !route?.car
      ? `${walk.minutes} min pieszo · ${String(walk.km).replace('.', ',')} km`
      : `${route.car.minutes} min autem · ${walk.minutes} min pieszo`
    : undefined
  const leaveBy =
    plan && leg?.arriveBy
      ? shiftClock(plan.departAt ?? shiftClock(leg.arriveBy, -plan.minutes), -trip.travelBufferMin)
      : undefined

  return (
    <section className="island flex flex-col items-center border-accent p-4 text-center">
      <CountdownRing now={now} leaveBy={leaveBy} startsAt={card.time} />
      <button type="button" onClick={onOpen} className="mt-2 block">
        <span className="text-lg font-bold">
          {card.title || card.location.name}
          {card.time && <span className="text-muted"> · {card.time}</span>}
        </span>
        <span className="block text-xs text-subtle italic">
          ⌖ {card.location.name}
          {plan && ` · ${plan.minutes} min ${TRAVEL_MODE_LABELS[plan.mode]}`}
        </span>
      </button>
      {travel && (
        <p className="mt-1 text-xs text-muted">
          {travel}
          {!position && from ? ' z noclegu' : ''}
        </p>
      )}
      <div className="w-full">
        <CanWeMakeIt card={card} />
        <a
          href={navigationUrl(card.location)}
          target="_blank"
          rel="noreferrer"
          className="mt-2 flex min-h-11 items-center justify-center gap-1 rounded-small bg-accent text-sm font-bold text-on-accent"
        >
          <Navigation className="size-4" aria-hidden="true" /> nawiguj
        </a>
      </div>
    </section>
  )
}

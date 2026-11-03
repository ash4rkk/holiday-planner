'use client'

import {
  CARD_TYPE_LABELS,
  type CardSnapshot,
  daysBetween,
  formatAmount,
  hasCoords,
  type LatLng,
  type MappedCard,
  navigationUrl,
  nextPlace,
  staysOver,
  todayLocal,
} from '@planer/core'
import { LocateFixed, Navigation } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import type { Route } from '@/app/api/route/route'
import { TotalsText } from '@/components/amounts'
import { fieldsSummary } from '@/components/card/card-fields'
import { CardSheet } from '@/components/card/card-sheet'
import { TYPE_STYLE } from '@/components/card/type-style'
import { cx, SectionLabel } from '@/components/ui'
import { useWeather, weatherIcon, weatherPlace } from '@/components/weather'
import { useCardSheet } from '@/lib/use-card-sheet'
import { useFetchCached } from '@/lib/use-fetch-cached'
import { usePosition } from '@/lib/use-position'
import { useCards, useTrip } from '@/lib/yjs/trip-doc'

const nowHHMM = (d = new Date()) =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

/** Pulpit w trakcie wyjazdu: oś dnia, następne miejsce z dojazdem, pogoda, wydatki dzisiaj. */
export function TodayDashboard({ userName }: { userName: string }) {
  const { trip } = useTrip()
  const cards = useCards()
  const sheet = useCardSheet()
  const today = todayLocal()
  const [now, setNow] = useState(nowHHMM())
  useEffect(() => {
    const t = setInterval(() => setNow(nowHHMM()), 60_000)
    return () => clearInterval(t)
  }, [])

  const live = useMemo(() => cards.filter((c) => !c.deletedAt), [cards])
  const todays = useMemo(
    () =>
      live
        .filter((c) => c.date === today)
        .sort(
          (a, b) =>
            (a.time ?? '').localeCompare(b.time ?? '') || a.createdAt.localeCompare(b.createdAt),
        ),
    [live, today],
  )
  const stay = live.filter(hasCoords).find((c) => staysOver(c, today))
  const next = nextPlace(live, today, now)
  const dayIndex = trip.startDate ? daysBetween(trip.startDate, today) + 1 : undefined
  const main = trip.currencies[0] ?? 'PLN'

  return (
    <>
      <section className="island border-t-2 border-t-accent p-4">
        <p className="text-xl font-bold">cześć, {userName}</p>
        <p className="mt-1 text-sm text-muted">
          {dayIndex && `dzień ${dayIndex} · `}
          <Link href={`/trips/${trip.id}/list`} className="text-accent">
            {trip.title} ›
          </Link>
        </p>
        {stay && (
          <p className="mt-1 text-xs text-subtle italic">
            nocleg: {stay.title || stay.location.name}
          </p>
        )}
      </section>

      <div className="grid grid-cols-2 gap-1">
        <WeatherTile at={weatherPlace(cards, today)} today={today} />
        <section className="island flex flex-col justify-center p-3">
          <p className="text-xs text-subtle italic">wydatki dzisiaj</p>
          {todays.some((c) => c.amounts?.length) ? (
            <TotalsText cards={todays} mainCurrency={main} className="text-sm font-bold" />
          ) : (
            <p className="text-sm text-dim">{formatAmount({ value: 0, currency: 'PLN' })}</p>
          )}
        </section>
      </div>

      {next && <NextPlace card={next} from={stay} onOpen={() => sheet.open(next.id)} />}

      <SectionLabel>plan dnia</SectionLabel>
      {todays.length === 0 ? (
        <p className="island p-4 text-sm text-muted">● na dziś nic nie zaplanowano</p>
      ) : (
        <ol className="island flex flex-col p-2" aria-label="plan dnia">
          {todays.map((card, i) => {
            const prev = todays[i - 1]
            // Kreska „teraz” między ostatnią minioną a pierwszą przyszłą pozycją z godziną.
            const nowLine = card.time && card.time > now && (!prev?.time || prev.time <= now)
            return (
              <li key={card.id}>
                {nowLine && (
                  <div
                    className="my-1 flex items-center gap-2 px-2 text-[11px] font-bold text-accent"
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
                    'flex w-full items-start gap-3 rounded-[9px] px-2 py-2 text-left hover:bg-raised',
                    card.time && card.time < now && 'opacity-60',
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
                    <span
                      className={cx(
                        'block truncate font-bold',
                        card.status === 'done' && 'text-subtle line-through',
                      )}
                    >
                      {card.title || 'bez tytułu'}
                    </span>
                    <span className="block truncate text-xs text-subtle italic">
                      {[
                        fieldsSummary({ ...card, time: undefined }),
                        card.location?.name && `⌖ ${card.location.name}`,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      )}

      {sheet.openId && (
        <CardSheet
          key={sheet.openId}
          cardId={sheet.openId}
          isNew={sheet.isNew}
          onClose={sheet.close}
        />
      )}
    </>
  )
}

function WeatherTile({ at, today }: { at?: LatLng; today: string }) {
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
        className="island flex flex-col justify-center p-3 text-left"
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
    <section className="island flex items-center gap-3 p-3" aria-label={`pogoda: ${label}`}>
      <Icon className="size-7 shrink-0 text-amber" aria-hidden="true" />
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
  onOpen,
}: {
  card: MappedCard
  from?: MappedCard
  onOpen: () => void
}) {
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

  return (
    <section className="island border-t-2 border-t-accent p-3">
      <p className="text-xs text-subtle italic">następne{card.time ? ` · ${card.time}` : ''}</p>
      <button type="button" onClick={onOpen} className="mt-0.5 block text-left">
        <span className="font-bold">{card.title || card.location.name}</span>
        <span className="block text-xs text-subtle">⌖ {card.location.name}</span>
      </button>
      {travel && (
        <p className="mt-1 text-sm">
          {travel}
          {!position && from ? ' z noclegu' : ''}
        </p>
      )}
      <a
        href={navigationUrl(card.location)}
        target="_blank"
        rel="noreferrer"
        className="mt-2 flex min-h-11 items-center justify-center gap-1 rounded-small bg-accent text-sm font-bold text-on-accent"
      >
        <Navigation className="size-4" aria-hidden="true" /> nawiguj
      </a>
    </section>
  )
}

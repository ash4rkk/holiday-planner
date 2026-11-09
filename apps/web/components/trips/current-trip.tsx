'use client'

import { daysBetween, formatAmount, formatDateSpan } from '@planer/core'
import type { Trip } from '@planer/core/db'
import Link from 'next/link'
import { type ReactNode, useEffect, useState, ViewTransition } from 'react'
import { TripSettingsLink } from '@/components/trips/trip-settings-link'
import { cx } from '@/components/ui'
import { useWeather, weatherIcon } from '@/components/weather'
import type { TripSummary } from '@/lib/trip-summary'

/** Minuty różnicy między strefą wyjazdu a strefą urządzenia. */
function offsetMinutes(timezone: string, now: Date): number {
  const at = (tz?: string) => Date.parse(now.toLocaleString('en-US', { timeZone: tz }))
  return Math.round((at(timezone) - at()) / 60_000)
}

/** Godzina w strefie wyjazdu, odświeżana co minutę (dopiero po stronie klienta). */
function useLocalTime(timezone: string) {
  const [now, setNow] = useState<Date>()
  useEffect(() => {
    setNow(new Date())
    const id = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(id)
  }, [])
  if (!now) return undefined
  const time = new Intl.DateTimeFormat('pl-PL', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone,
  }).format(now)
  const diff = offsetMinutes(timezone, now)
  const h = diff / 60
  const shift = diff === 0 ? 'jak u ciebie' : `${h > 0 ? '+' : '−'}${Math.abs(h)} h`
  return { time, shift }
}

const tile = 'flex min-w-0 flex-col justify-center rounded-small bg-raised px-3 py-2'

/** Wysepka trwającego wyjazdu: dzień, wydatki z wykresem dni, pogoda i godzina na miejscu. */
export function CurrentTrip({
  trip,
  summary,
  today,
  flag,
  country,
}: {
  trip: Trip
  summary: TripSummary
  today: string
  /** Flaga kraju (komponent serwerowy, żeby flagi nie trafiały do bundla klienta). */
  flag?: ReactNode
  /** Nazwa kraju po polsku. */
  country?: string
}) {
  const start = trip.startDate ?? today
  const dayNo = daysBetween(start, today) + 1
  const dayCount = daysBetween(start, trip.endDate ?? start) + 1
  const weather = useWeather(summary.place)
  const local = useLocalTime(trip.timezone)
  const now = weather?.current
  const icon = now ? weatherIcon(now.code) : undefined
  const max = Math.max(...summary.days.map((d) => d.pln), 0)

  return (
    <div className="relative">
      <Link
        href={`/trips/${trip.id}/today`}
        className="island flex flex-col gap-3 border-accent p-4 transition-colors hover:border-accent-hover"
      >
        <div>
          <p className="text-xs text-accent">
            ● trwa · dzień {dayNo} z {dayCount}
          </p>
          <div className="flex min-w-0 items-center gap-2">
            {/* Flaga przechodzi do nagłówka wyjazdu razem z nazwą. */}
            <ViewTransition name={`trip-flag-${trip.id}`}>
              <span className="flex shrink-0">{flag}</span>
            </ViewTransition>
            <ViewTransition name={`trip-${trip.id}`}>
              <p className="truncate text-2xl font-bold">{trip.title}</p>
            </ViewTransition>
          </div>
          <p className="text-xs text-subtle">
            {country && `${country} · `}
            {formatDateSpan(trip.startDate, trip.endDate)}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-1">
          <div className={cx(tile, 'col-span-2 flex-row items-end gap-3')}>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-subtle">wydatki</p>
              <p className="truncate text-xl font-bold">
                {formatAmount(summary.main ?? { value: summary.pln, currency: 'PLN' })}
              </p>
              {summary.main && (
                <p className="text-xs text-muted">
                  ≈ {formatAmount({ value: summary.pln, currency: 'PLN' })}
                </p>
              )}
            </div>
            {summary.any && summary.days.length > 1 && (
              <figure className="flex w-2/5 max-w-40 flex-col gap-0.5">
                <figcaption className="truncate text-right text-2xs text-subtle">
                  najwięcej {formatAmount({ value: Math.round(max), currency: 'PLN' })}
                </figcaption>
                <div className="flex h-10 items-end gap-0.5" aria-hidden="true">
                  {summary.days.map((d) => (
                    <span
                      key={d.date}
                      title={d.date}
                      className={cx(
                        'min-h-0.5 flex-1 rounded-[2px]',
                        d.date === today ? 'bg-accent' : d.date < today ? 'bg-subtle' : 'bg-line',
                      )}
                      style={{ height: `${max ? (d.pln / max) * 100 : 0}%` }}
                    />
                  ))}
                </div>
                {/* Numery dni pod słupkami; przy długim wyjeździe tylko pierwszy i ostatni. */}
                <div className="flex gap-0.5 text-2xs text-subtle tabular-nums" aria-hidden="true">
                  {summary.days.map((d, i) => {
                    const edge = i === 0 || i === summary.days.length - 1
                    const show = summary.days.length <= 10 || edge
                    return (
                      <span
                        key={d.date}
                        className={cx(
                          'flex-1 text-center',
                          d.date === today && 'font-bold text-accent',
                        )}
                      >
                        {show ? i + 1 : ''}
                      </span>
                    )
                  })}
                </div>
              </figure>
            )}
          </div>

          {summary.place && (
            <div className={tile}>
              <p className="text-xs text-subtle">pogoda</p>
              {now && icon ? (
                <p className="flex items-center gap-1.5 font-bold" title={icon.label}>
                  <icon.icon className="size-4 text-muted" aria-hidden="true" />
                  {Math.round(now.temp)}°<span className="sr-only">{icon.label}</span>
                </p>
              ) : (
                <p className="text-subtle">—</p>
              )}
            </div>
          )}
          <div className={cx(tile, !summary.place && 'col-span-2')}>
            <p className="text-xs text-subtle">tam jest</p>
            <p className="font-bold">
              {local?.time ?? '—'}
              {local && (
                <span className="ml-1.5 text-xs font-normal text-muted">{local.shift}</span>
              )}
            </p>
          </div>
        </div>

        <span className="flex min-h-11 items-center justify-center rounded-island bg-accent font-bold text-on-accent">
          otwórz dziś ›
        </span>
      </Link>
      {/* Osobny link w rogu — zagnieżdżony w kafelku byłby linkiem w linku. */}
      <TripSettingsLink tripId={trip.id} className="absolute top-1.5 right-1.5" />
    </div>
  )
}

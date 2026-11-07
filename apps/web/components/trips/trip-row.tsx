import { formatDateSpan } from '@planer/core'
import type { Trip } from '@planer/core/db'
import Link from 'next/link'
import { ViewTransition } from 'react'
import { Flag } from './flag'

/** Wiersz wyjazdu; `countdown` (dni do wyjazdu) jako duża liczba z lewej. */
export function TripRow({ trip, countdown }: { trip: Trip; countdown?: number }) {
  return (
    <Link
      href={`/trips/${trip.id}/today`}
      className="island flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:border-accent"
    >
      {countdown !== undefined && (
        <div className="flex min-w-10 flex-col items-center leading-tight">
          <span className="text-xl font-bold text-accent">{countdown}</span>
          <span className="text-xs text-subtle">{countdown === 1 ? 'dzień' : 'dni'}</span>
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <Flag country={trip.country} className="h-3 w-[18px]" />
          <ViewTransition name={`trip-${trip.id}`}>
            <p className="truncate font-bold">{trip.title}</p>
          </ViewTransition>
        </div>
        <p className="text-xs text-subtle italic">
          {formatDateSpan(trip.startDate, trip.endDate)}
          {trip.currencies.length > 0 && ` · ${trip.currencies.join(', ')}`}
        </p>
      </div>
      <span className="text-muted" aria-hidden="true">
        ›
      </span>
    </Link>
  )
}

import { formatDateSpan } from '@planer/core'
import type { Trip } from '@planer/core/db'
import Link from 'next/link'

export function TripRow({ trip, note }: { trip: Trip; note?: string }) {
  return (
    <Link
      href={`/trips/${trip.id}/list`}
      className="island flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:border-accent"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate font-bold">{trip.title}</p>
        <p className="text-xs text-subtle italic">
          {formatDateSpan(trip.startDate, trip.endDate)}
          {trip.currencies.length > 0 && ` · ${trip.currencies.join(', ')}`}
        </p>
      </div>
      {note && <span className="text-xs text-accent">{note}</span>}
      <span className="text-muted" aria-hidden="true">
        ›
      </span>
    </Link>
  )
}

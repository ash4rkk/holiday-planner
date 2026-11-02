'use client'

import { Inbox } from 'lucide-react'
import Link from 'next/link'
import { useTrip } from '@/lib/yjs/trip-doc'

/** Przycisk skrzynki w nagłówku wyjazdu, z liczbą miejsc do rozdzielenia. */
export function InboxButton() {
  const { trip } = useTrip()
  return (
    <Link
      href={`/trips/${trip.id}/inbox`}
      aria-label={`skrzynka miejsc${trip.inboxCount ? ` (${trip.inboxCount})` : ''}`}
      className="island relative flex size-11 shrink-0 items-center justify-center text-muted hover:text-accent"
    >
      <Inbox className="size-5" aria-hidden="true" />
      {trip.inboxCount > 0 && (
        <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[11px] font-bold text-on-accent">
          {trip.inboxCount}
        </span>
      )}
    </Link>
  )
}

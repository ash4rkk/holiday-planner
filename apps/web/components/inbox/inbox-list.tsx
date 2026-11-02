'use client'

import { formatShortDate } from '@planer/core'
import type { InboxItem } from '@planer/core/db'
import { Inbox } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { resolveInboxItem } from '@/app/(app)/trips/[tripId]/inbox/actions'
import { MiniMap } from '@/components/map/mini-map'
import { TopBar } from '@/components/top-bar'
import { buttonClass } from '@/components/ui'
import { createPlaceCard } from '@/lib/place-card'
import { useTrip } from '@/lib/yjs/trip-doc'

/** Skrzynka: miejsca z „Udostępnij → Planer”; jednym dotknięciem karta, albo odrzucenie. */
export function InboxList({ items }: { items: InboxItem[] }) {
  const { trip, doc } = useTrip()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [done, setDone] = useState<Set<string>>(new Set())

  const resolve = (item: InboxItem, makeCard: boolean) => {
    if (makeCard) createPlaceCard(doc, item)
    setDone((s) => new Set(s).add(item.id))
    startTransition(async () => {
      await resolveInboxItem(trip.id, item.id)
      router.refresh()
    })
  }

  const visible = items.filter((i) => !done.has(i.id))

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-1">
      <TopBar
        title="skrzynka"
        subtitle={trip.title}
        back={{ href: `/trips/${trip.id}/list`, label: 'wróć do listy' }}
      />
      {visible.length === 0 && (
        <div className="island flex items-start gap-3 p-4 text-sm text-muted">
          <Inbox className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <p>
            pusto · w Google Maps wybierz <b>Udostępnij → Planer</b>, a miejsce trafi tutaj
          </p>
        </div>
      )}
      {visible.map((item) => (
        <article key={item.id} className="island flex flex-col gap-2 p-3">
          <div>
            <p className="font-bold">{item.name}</p>
            {item.address && <p className="text-xs text-subtle italic">{item.address}</p>}
            {item.note && <p className="mt-1 text-sm text-muted">{item.note}</p>}
            <p className="mt-1 text-[11px] text-dim italic">
              dodane {formatShortDate(item.createdAt.toISOString().slice(0, 10))}
              {item.lat == null && ' · bez współrzędnych'}
            </p>
          </div>
          {item.lat != null && item.lng != null && <MiniMap lat={item.lat} lng={item.lng} />}
          <div className="grid grid-cols-2 gap-1">
            <button
              type="button"
              disabled={pending}
              onClick={() => resolve(item, false)}
              className={buttonClass('island')}
            >
              odrzuć
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => resolve(item, true)}
              className={buttonClass('primary')}
            >
              utwórz kartę
            </button>
          </div>
        </article>
      ))}
    </main>
  )
}

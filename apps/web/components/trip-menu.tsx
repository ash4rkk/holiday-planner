'use client'

import { ChevronDown, FileDown, Luggage, Settings2, Users } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useRef, useState, ViewTransition } from 'react'
import { cx } from '@/components/ui'
import { tripView } from '@/lib/back'
import { useDismiss } from '@/lib/use-dismiss'
import { useTrip } from '@/lib/yjs/trip-doc'

/** Nazwa wyjazdu z flagą kraju (flagę renderuje serwer w layoucie wyjazdu). */
export function TripTitle() {
  const { trip } = useTrip()
  if (!trip.flag) return trip.title
  return (
    <span className="flex min-w-0 items-center gap-2">
      <ViewTransition name={`trip-flag-${trip.id}`}>
        <span className="flex shrink-0">{trip.flag}</span>
      </ViewTransition>
      <span className="truncate">{trip.title}</span>
    </span>
  )
}

const item =
  'flex min-h-11 items-center gap-3 rounded-small px-3 text-sm text-text hover:bg-raised hover:text-accent'

/** Menu wyjazdu przy nazwie w górnej wysepce: ustawienia, link dla rodziny, eksport. */
export function TripMenu() {
  const { trip } = useTrip()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  // Ustawienia wracają do widoku, z którego je otwarto.
  const view = tripView(usePathname())
  const settings = `/trips/${trip.id}/settings${view ? `?from=${view}` : ''}`

  useDismiss(open, () => setOpen(false), ref)

  return (
    <div ref={ref} className="relative flex self-stretch border-l border-line">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="menu wyjazdu"
        title="menu wyjazdu"
        className="flex w-11 items-center justify-center text-muted hover:text-accent aria-expanded:text-accent"
      >
        <ChevronDown
          className={cx('size-5 transition-transform duration-200', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div
          role="menu"
          className="island fade-in absolute top-full right-0 z-(--z-nav) mt-2 flex w-56 flex-col p-1"
        >
          <Link
            role="menuitem"
            href={`/trips/${trip.id}/packing`}
            className={item}
            onClick={() => setOpen(false)}
          >
            <Luggage className="size-4 text-muted" aria-hidden="true" /> lista pakowania
          </Link>
          <Link role="menuitem" href={settings} className={item} onClick={() => setOpen(false)}>
            <Settings2 className="size-4 text-muted" aria-hidden="true" /> ustawienia wyjazdu
          </Link>
          <Link
            role="menuitem"
            href={`${settings}#rodzina`}
            className={item}
            onClick={() => setOpen(false)}
          >
            <Users className="size-4 text-muted" aria-hidden="true" /> link dla rodziny
          </Link>
          <Link
            role="menuitem"
            href={`${settings}#eksport`}
            className={item}
            onClick={() => setOpen(false)}
          >
            <FileDown className="size-4 text-muted" aria-hidden="true" /> eksport
          </Link>
        </div>
      )}
    </div>
  )
}

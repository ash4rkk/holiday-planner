'use client'

import { FileDown, Settings2, Users } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useTrip } from '@/lib/yjs/trip-doc'

/** Nazwa wyjazdu z flagą kraju (flagę renderuje serwer w layoucie wyjazdu). */
export function TripTitle() {
  const { trip } = useTrip()
  if (!trip.flag) return trip.title
  return (
    <span className="flex min-w-0 items-center gap-2">
      {trip.flag}
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
  const settings = `/trips/${trip.id}/settings`

  useEffect(() => {
    if (!open) return
    const outside = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const escape = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

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
        <Settings2 className="size-5" aria-hidden="true" />
      </button>
      {open && (
        <div
          role="menu"
          className="island fade-in absolute top-full right-0 z-30 mt-2 flex w-56 flex-col p-1"
        >
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

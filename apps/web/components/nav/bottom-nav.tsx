'use client'

import { LayoutDashboard, List, Map as MapIcon, Sun } from 'lucide-react'
import Link from 'next/link'
import { useParams, usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { cx } from '@/components/ui'
import { useNavHidden } from './nav-context'

const LAST_TRIP_KEY = 'planer-last-trip'

/**
 * Pływająca kapsuła wyjazdu: dziś, tablica, lista, mapa. Poza wyjazdem prowadzi do ostatnio
 * otwartego, a bez żadnego wyjazdu do listy wyjazdów. Na wyborze profilu jej nie ma.
 */
export function BottomNav({ fallbackTripId }: { fallbackTripId?: string }) {
  const pathname = usePathname()
  const params = useParams<{ tripId?: string }>()
  const hidden = useNavHidden()
  const [lastTrip, setLastTrip] = useState<string>()
  useEffect(() => {
    try {
      if (params.tripId) localStorage.setItem(LAST_TRIP_KEY, params.tripId)
      setLastTrip(localStorage.getItem(LAST_TRIP_KEY) ?? undefined)
    } catch {}
  }, [params.tripId])
  const tripId = params.tripId ?? lastTrip ?? fallbackTripId
  const tripHref = (view: string) => (tripId ? `/trips/${tripId}/${view}` : '/trips')

  const items = [
    { href: tripHref('today'), label: 'dziś', icon: Sun, active: pathname.endsWith('/today') },
    {
      href: tripHref('board'),
      label: 'tablica',
      icon: LayoutDashboard,
      active: pathname.endsWith('/board'),
    },
    { href: tripHref('list'), label: 'lista', icon: List, active: pathname.endsWith('/list') },
    { href: tripHref('map'), label: 'mapa', icon: MapIcon, active: pathname.endsWith('/map') },
  ]

  if (pathname === '/') return null

  return (
    <nav
      aria-label="menu"
      className={cx(
        'fixed inset-x-0 bottom-0 z-30 flex justify-center pb-[max(8px,env(safe-area-inset-bottom))]',
        'pointer-events-none transition-transform duration-200 motion-reduce:transition-none',
        hidden && 'translate-y-[calc(100%+8px)]',
      )}
    >
      <ul className="pointer-events-auto flex items-center gap-1 rounded-island border border-line bg-panel/82 p-1 backdrop-blur-[14px]">
        {items.map(({ href, label, icon: Icon, active }) => (
          <li key={label}>
            <Link
              href={href}
              aria-label={label}
              aria-current={active ? 'page' : undefined}
              className={cx(
                'flex h-11 items-center justify-center gap-2 rounded-[9px] transition-colors',
                active ? 'bg-accent/20 px-4 text-accent' : 'w-11 text-muted hover:text-text',
              )}
            >
              <Icon className="size-5" aria-hidden="true" strokeWidth={1.8} />
              {active && <span className="text-sm font-bold">{label}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}

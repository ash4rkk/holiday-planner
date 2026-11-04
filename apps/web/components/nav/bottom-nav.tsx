'use client'

import { LayoutDashboard, List, Map as MapIcon, Sun } from 'lucide-react'
import Link from 'next/link'
import { useParams, usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { cx } from '@/components/ui'
import { useNavHidden } from './nav-context'

const LAST_TRIP_KEY = 'planer-last-trip'
const SWIPE_MIN_PX = 70
const SWIPE_MAX_MS = 600
export const NAV_SLOT = 'nav-slot'

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

  // Przesunięcie palcem w bok zmienia ekran. Na Tablicy i Mapie palec rusza widokiem, więc tam nie.
  const router = useRouter()
  const order = tripId ? items.map((i) => i.href) : []
  const orderKey = order.join()
  useEffect(() => {
    if (!/\/(today|list)$/.test(pathname) || !orderKey) return
    const hrefs = orderKey.split(',')
    let start: { x: number; y: number; at: number } | null = null
    const down = (e: TouchEvent) => {
      const t = e.touches[0]
      const target = e.target as HTMLElement
      // Filtry przewijane w bok, pola tekstowe i otwarte okna mają własne gesty.
      const own = target.closest('.overflow-x-auto, input, textarea, [role=dialog]')
      start =
        t && e.touches.length === 1 && !own ? { x: t.clientX, y: t.clientY, at: e.timeStamp } : null
    }
    const up = (e: TouchEvent) => {
      const t = e.changedTouches[0]
      if (!start || !t) return
      const dx = t.clientX - start.x
      const dy = t.clientY - start.y
      const quick = e.timeStamp - start.at < SWIPE_MAX_MS
      start = null
      if (!quick || Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dy) > Math.abs(dx) / 2) return
      const next = hrefs[hrefs.indexOf(window.location.pathname) + (dx < 0 ? 1 : -1)]
      if (next) router.push(next)
    }
    document.addEventListener('touchstart', down, { passive: true })
    document.addEventListener('touchend', up, { passive: true })
    return () => {
      document.removeEventListener('touchstart', down)
      document.removeEventListener('touchend', up)
    }
  }, [pathname, orderKey, router])

  if (pathname === '/') return null

  return (
    <nav
      aria-label="menu"
      className={cx(
        'bottom-nav fixed inset-x-0 bottom-0 z-30 flex justify-center pb-[max(8px,env(safe-area-inset-bottom))]',
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
        {/* Tu widoki wyjazdu wstawiają przycisk „+” (AddButton), żeby nie zasłaniał treści. */}
        <li id={NAV_SLOT} className="empty:hidden" />
      </ul>
    </nav>
  )
}

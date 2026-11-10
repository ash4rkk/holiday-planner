'use client'

import { CloudSun, LayoutDashboard, List, Map as MapIcon, Sun } from 'lucide-react'
import Link from 'next/link'
import { useParams, usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { cx } from '@/components/ui'
import { useScrollHidden } from '@/lib/use-scroll-direction'

const LAST_TRIP_KEY = 'planer-last-trip'
const VIEWS = [
  { view: 'today', label: 'dziś', icon: Sun },
  { view: 'list', label: 'lista', icon: List },
  { view: 'board', label: 'tablica', icon: LayoutDashboard },
  { view: 'map', label: 'mapa', icon: MapIcon },
  { view: 'weather', label: 'pogoda', icon: CloudSun },
] as const

/** Kierunek przejścia między widokami wyjazdu: nowy widok wjeżdża od strony, w którą idziemy. */
export function navDirection(from: number, to: number): string[] | undefined {
  if (from < 0 || to < 0 || from === to) return undefined
  return [to > from ? 'nav-forward' : 'nav-back']
}
const SWIPE_MIN_PX = 70
const SWIPE_MAX_MS = 600
export const NAV_SLOT = 'nav-slot'
/**
 * Zdarzenie „miejsce na „+” gotowe”. Widok wstawia tam „+” portalem dopiero po hydratacji menu:
 * menu jest w osobnym <Suspense>, więc widok bywa gotowy wcześniej, a obcy element w jeszcze
 * nieuwodnionym menu to błąd hydratacji (React buduje menu od nowa i „+” zostaje w odpiętym węźle).
 */
export const NAV_SLOT_READY = 'nav-slot-ready'

/** Widoczny ekran (ukryte przez router widoki mają display: none). */
function activePage(): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>('.app main'))
    if (el.offsetParent !== null || el.getClientRects().length) return el
  return null
}

/**
 * Pływająca kapsuła wyjazdu: dziś, lista, tablica, mapa, pogoda. Poza wyjazdem prowadzi do ostatnio
 * otwartego, a bez żadnego wyjazdu do listy wyjazdów. Na wyborze profilu jej nie ma.
 */
export function BottomNav({ fallbackTripId }: { fallbackTripId?: string }) {
  const slot = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = slot.current
    if (!el) return
    el.dataset.ready = '1'
    window.dispatchEvent(new Event(NAV_SLOT_READY))
    return () => {
      delete el.dataset.ready
    }
  })
  const pathname = usePathname()
  const params = useParams<{ tripId?: string }>()
  // Na Tablicy i Mapie menu się nie chowa — przesuwanie palcem rusza widokiem.
  const hidden = useScrollHidden(!/\/(board|map)$/.test(pathname), pathname)
  const [lastTrip, setLastTrip] = useState<string>()
  useEffect(() => {
    try {
      if (params.tripId) localStorage.setItem(LAST_TRIP_KEY, params.tripId)
      setLastTrip(localStorage.getItem(LAST_TRIP_KEY) ?? undefined)
    } catch {}
  }, [params.tripId])
  const tripId = params.tripId ?? lastTrip ?? fallbackTripId
  const tripHref = (view: string) => (tripId ? `/trips/${tripId}/${view}` : '/trips')

  // Pozycja podświetla się od razu po dotknięciu, zanim przyjdzie nowy widok.
  const [tapped, setTapped] = useState<string>()
  useEffect(() => setTapped(undefined), [pathname])
  const current = tapped ?? pathname
  const items = VIEWS.map((v) => ({
    ...v,
    href: tripHref(v.view),
    active: current.endsWith(`/${v.view}`),
  }))
  const activeIndex = VIEWS.findIndex((v) => pathname.endsWith(`/${v.view}`))

  // Przesunięcie palcem w bok zmienia ekran. Na Tablicy i Mapie palec rusza widokiem, więc tam nie.
  const router = useRouter()
  const order = tripId ? items.map((i) => i.href) : []
  const orderKey = order.join()
  useEffect(() => {
    if (!/\/(today|list|weather)$/.test(pathname) || !orderKey) return
    const hrefs = orderKey.split(',')
    let start: { x: number; y: number; at: number } | null = null
    // Widok idzie za palcem (z oporem), więc widać, że gest działa i dokąd prowadzi.
    let page: HTMLElement | null = null
    let dragging = false
    const from = () => hrefs.indexOf(window.location.pathname)
    const down = (e: TouchEvent) => {
      const t = e.touches[0]
      const target = e.target as HTMLElement
      // Filtry przewijane w bok, pola tekstowe i otwarte okna mają własne gesty.
      const own = target.closest('.overflow-x-auto, input, textarea, [role=dialog]')
      start =
        t && e.touches.length === 1 && !own ? { x: t.clientX, y: t.clientY, at: e.timeStamp } : null
      dragging = false
      page = start ? activePage() : null
    }
    const move = (e: TouchEvent) => {
      const t = e.touches[0]
      if (!start || !t || !page) return
      const dx = t.clientX - start.x
      const dy = t.clientY - start.y
      if (!dragging) {
        // Ruch w pionie to przewijanie — gest odpada do końca dotyku.
        if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
          start = null
          return
        }
        if (Math.abs(dx) < 12) return
        dragging = true
        page.style.transition = 'none'
      }
      // Za krawędzią (pierwszy/ostatni widok) opór jest większy.
      const edge = !hrefs[from() + (dx < 0 ? 1 : -1)]
      const shift = dx * (edge ? 0.12 : 0.35)
      page.style.transform = `translateX(${shift}px)`
      page.style.opacity = String(1 - Math.min(Math.abs(shift) / 400, 0.25))
    }
    const settle = (el: HTMLElement | null) => {
      if (!el) return
      el.style.transition = 'transform 200ms cubic-bezier(0.23, 1, 0.32, 1), opacity 200ms'
      el.style.transform = ''
      el.style.opacity = ''
    }
    const up = (e: TouchEvent) => {
      const t = e.changedTouches[0]
      const el = page
      page = null
      if (!start || !t) return settle(el)
      const dx = t.clientX - start.x
      const dy = t.clientY - start.y
      const quick = e.timeStamp - start.at < SWIPE_MAX_MS
      const far = Math.abs(dx) > window.innerWidth * 0.3
      start = null
      if ((!quick && !far) || Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dy) > Math.abs(dx) / 2)
        return settle(el)
      const at = from()
      const to = at + (dx < 0 ? 1 : -1)
      const next = hrefs[to]
      if (!next) return settle(el)
      navigator.vibrate?.(5)
      router.push(next, { transitionTypes: navDirection(at, to) })
    }
    const cancel = () => {
      settle(page)
      page = null
      start = null
    }
    document.addEventListener('touchstart', down, { passive: true })
    document.addEventListener('touchmove', move, { passive: true })
    document.addEventListener('touchend', up, { passive: true })
    document.addEventListener('touchcancel', cancel, { passive: true })
    return () => {
      document.removeEventListener('touchstart', down)
      document.removeEventListener('touchmove', move)
      document.removeEventListener('touchend', up)
      document.removeEventListener('touchcancel', cancel)
    }
  }, [pathname, orderKey, router])

  // Po zmianie widoku przesunięcie z gestu znika (ukryty widok wraca potem na swoje miejsce).
  useEffect(() => {
    for (const el of document.querySelectorAll<HTMLElement>('.app main')) {
      el.style.transition = ''
      el.style.transform = ''
      el.style.opacity = ''
    }
  }, [pathname])

  if (pathname === '/') return null

  return (
    <nav
      aria-label="menu"
      className={cx(
        'bottom-nav fixed inset-x-0 bottom-0 z-(--z-nav) flex justify-center pb-[max(8px,env(safe-area-inset-bottom))]',
        'pointer-events-none transition-transform duration-200 motion-reduce:transition-none',
        hidden && 'translate-y-[calc(100%+8px)]',
      )}
    >
      {/* Stała szerokość: wybrana pozycja wypełnia resztę, więc kapsuła nie skacze między ekranami. */}
      <ul className="pointer-events-auto flex w-[292px] items-center justify-between gap-0.5 rounded-island border border-line bg-panel/82 p-1 shadow-float backdrop-blur-[14px]">
        {items.map(({ href, label, icon: Icon, active }, i) => (
          <li key={label} className={cx(active && 'flex-1')}>
            <Link
              href={href}
              transitionTypes={navDirection(activeIndex, i)}
              onNavigate={() => setTapped(href)}
              aria-label={label}
              aria-current={active ? 'page' : undefined}
              className={cx(
                'flex h-11 items-center justify-center gap-1.5 rounded-inner transition-colors',
                active ? 'bg-active px-2.5 text-accent' : 'w-11 text-muted hover:text-text',
              )}
            >
              <Icon className="size-5" aria-hidden="true" strokeWidth={1.8} />
              {active && <span className="text-sm font-bold">{label}</span>}
            </Link>
          </li>
        ))}
      </ul>
      {/* Osobna wysepka na „+” (AddButton) z widoku. Bez niego zostaje puste miejsce tej samej
          wielkości, żeby menu stało w jednym miejscu na każdym ekranie. */}
      <div ref={slot} id={NAV_SLOT} className="pointer-events-auto ml-1 size-[54px] shrink-0" />
    </nav>
  )
}

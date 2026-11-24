'use client'

import { LayoutDashboard, List, Luggage, Map as MapIcon, Sun } from 'lucide-react'
import Link from 'next/link'
import { useParams, usePathname, useRouter } from 'next/navigation'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { cx } from '@/components/ui'
import { useExit } from '@/lib/exit'
import { SpringMotion } from '@/lib/motion'
import { project, release, VelocityTracker } from '@/lib/spring'
import { useDismiss } from '@/lib/use-dismiss'
import { useScrollHidden } from '@/lib/use-scroll-direction'
import { useNavPill } from './use-nav-pill'

const LAST_TRIP_KEY = 'planer-last-trip'
const VIEWS = [
  { view: 'today', label: 'dziś', icon: Sun },
  { view: 'list', label: 'lista', icon: List },
  { view: 'board', label: 'tablica', icon: LayoutDashboard },
  { view: 'map', label: 'mapa', icon: MapIcon },
] as const

/** Kierunek przejścia między widokami wyjazdu: nowy widok wjeżdża od strony, w którą idziemy. */
export function navDirection(from: number, to: number): string[] | undefined {
  if (from < 0 || to < 0 || from === to) return undefined
  return [to > from ? 'nav-forward' : 'nav-back']
}
/** Wysepka menu: pełne tło `raised`, obwódka `sel`, cień warstwy pływającej. */
export const NAV_ISLAND =
  'pointer-events-auto flex items-center gap-0.5 rounded-full border border-sel bg-raised p-1 shadow-float'
/** Część szerokości ekranu, za którą (z rzutem prędkości) gest zmienia widok. */
const SWIPE_PART = 0.3
/** Widok idzie za palcem z oporem; za pierwszym i ostatnim większym. */
const SWIPE_FOLLOW = 0.35
const SWIPE_EDGE = 0.12
export const NAV_SLOT = 'nav-slot'
/**
 * Zdarzenie „miejsce na „+” gotowe”. Widok wstawia tam „+” portalem dopiero po hydratacji menu:
 * menu jest w osobnym <Suspense>, więc widok bywa gotowy wcześniej, a obcy element w jeszcze
 * nieuwodnionym menu to błąd hydratacji (React buduje menu od nowa i „+” zostaje w odpiętym węźle).
 */
export const NAV_SLOT_READY = 'nav-slot-ready'

/** Zdejmuje z ekranu przesunięcie z gestu. */
function clear(el: HTMLElement | null) {
  if (!el) return
  el.style.transform = ''
  el.style.opacity = ''
}

/** Widoczny ekran (ukryte przez router widoki mają display: none). */
function activePage(): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>('.app main'))
    if (el.offsetParent !== null || el.getClientRects().length) return el
  return null
}

/**
 * Menu wyjazdu w dwóch wysepkach: dziś, lista, „+” widoku, tablica, mapa (pogoda jest w „dziś”). Poza wyjazdem prowadzi do ostatnio
 * otwartego, a bez żadnego wyjazdu do listy wyjazdów. Na wyborze profilu jej nie ma.
 */
/** Wyjazd w przełączniku menu (flaga gotowa z serwera). */
export type NavTrip = { id: string; title: string; sub: string; flag?: ReactNode }

export function BottomNav({
  fallbackTripId,
  trips = [],
}: {
  fallbackTripId?: string
  trips?: NavTrip[]
}) {
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
  const island = useRef<HTMLDivElement>(null)
  const pill = useRef<HTMLSpanElement>(null)
  useNavPill(island, pill, items.find((i) => i.active)?.view)
  const activeIndex = VIEWS.findIndex((v) => pathname.endsWith(`/${v.view}`))

  // Przesunięcie palcem w bok zmienia ekran. Na Tablicy i Mapie palec rusza widokiem, więc tam nie.
  const router = useRouter()
  const order = tripId ? items.map((i) => i.href) : []
  const orderKey = order.join()
  useEffect(() => {
    if (!/\/(today|list)$/.test(pathname) || !orderKey) return
    const hrefs = orderKey.split(',')
    let start: { x: number; y: number } | null = null
    // Widok idzie za palcem (z oporem), więc widać, że gest działa i dokąd prowadzi.
    let page: HTMLElement | null = null
    let dragging = false
    const speed = new VelocityTracker()
    const slide = new SpringMotion((x) => [
      [
        page,
        {
          transform: x === 0 ? 'none' : `translateX(${x}px)`,
          opacity: String(1 - Math.min(Math.abs(x) / 400, 0.25)),
        },
      ],
    ])
    const from = () => hrefs.indexOf(window.location.pathname)
    const down = (e: TouchEvent) => {
      const t = e.touches[0]
      const target = e.target as HTMLElement
      // Filtry przewijane w bok, pola tekstowe i otwarte okna mają własne gesty.
      const own = target.closest('.overflow-x-auto, input, textarea, [role=dialog]')
      start = t && e.touches.length === 1 && !own ? { x: t.clientX, y: t.clientY } : null
      dragging = false
      if (!start || !t) return
      slide.set(0)
      clear(page)
      page = activePage()
      speed.reset(e.timeStamp, t.clientX)
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
      }
      speed.add(e.timeStamp, t.clientX)
      // Za krawędzią (pierwszy/ostatni widok) opór jest większy.
      const edge = !hrefs[from() + (dx < 0 ? 1 : -1)]
      slide.set(dx * (edge ? SWIPE_EDGE : SWIPE_FOLLOW))
    }
    /** Powrót na miejsce z prędkością palca; `transform` znika, żeby nie zmieniał układu `fixed`. */
    const settle = (velocity = 0) => {
      const el = page
      if (slide.value === 0) return clear(el)
      slide.to(0, { velocity, spring: release(velocity), onDone: () => clear(el) })
    }
    const up = (e: TouchEvent) => {
      const t = e.changedTouches[0]
      const at = start
      start = null
      if (!at || !t || !dragging) return settle()
      const dx = t.clientX - at.x
      const dy = t.clientY - at.y
      const v = speed.at(e.timeStamp)
      const aimed = dx + project(v)
      const i = from()
      const to = i + (dx < 0 ? 1 : -1)
      const next = hrefs[to]
      const enough =
        Math.sign(aimed) === Math.sign(dx) && Math.abs(aimed) > window.innerWidth * SWIPE_PART
      if (!next || !enough || Math.abs(dy) > Math.abs(dx) / 2)
        return settle(v * (next ? SWIPE_FOLLOW : SWIPE_EDGE))
      navigator.vibrate?.(5)
      router.push(next, { transitionTypes: navDirection(i, to) })
    }
    const cancel = () => {
      start = null
      settle()
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
    for (const el of document.querySelectorAll<HTMLElement>('.app main')) clear(el)
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
      {/* Dwie wysepki z „+” pośrodku. Siatka 1fr · auto · 1fr trzyma „+” na środku ekranu,
          a wysepki rosną na zewnątrz, gdy wybrana pozycja rozwija się z nazwą. */}
      <div
        ref={island}
        className="relative grid w-full grid-cols-[1fr_auto_1fr] items-center gap-2 px-4"
      >
        {/* Pigułka wybranej pozycji, widoczna tylko w drodze (tło w spoczynku ma sama pozycja). */}
        <span
          ref={pill}
          aria-hidden="true"
          className="pointer-events-none absolute rounded-full bg-active opacity-0"
        />
        <ul className={cx(NAV_ISLAND, 'justify-self-end')}>
          {items.slice(0, 2).map((item, i) => (
            <NavItem
              key={item.view}
              {...item}
              dir={navDirection(activeIndex, i)}
              onTap={setTapped}
            />
          ))}
        </ul>
        {/* Środek: „+” (AddButton) z widoku. Bez niego (lista wyjazdów, pogoda) flaga wyjazdu,
            do którego prowadzi menu — dotknięcie przełącza wyjazd. */}
        <div className="pointer-events-auto relative flex items-center justify-center [&:has(>#nav-slot:not(:empty))>.trip-switch]:hidden">
          <div
            ref={slot}
            id={NAV_SLOT}
            className="flex size-14 items-center justify-center empty:hidden"
          />
          <TripSwitch
            trips={trips}
            current={tripId}
            view={tripView(pathname)}
            inTrip={!!params.tripId}
          />
        </div>
        <ul className={cx(NAV_ISLAND, 'justify-self-start')}>
          {items.slice(2).map((item, i) => (
            <NavItem
              key={item.view}
              {...item}
              dir={navDirection(activeIndex, i + 2)}
              onTap={setTapped}
            />
          ))}
        </ul>
      </div>
    </nav>
  )
}

function NavItem({
  view,
  href,
  label,
  icon: Icon,
  active,
  dir,
  onTap,
}: {
  view: string
  href: string
  label: string
  icon: (typeof VIEWS)[number]['icon']
  active: boolean
  dir?: string[]
  onTap: (href: string) => void
}) {
  return (
    <li>
      <Link
        data-nav={view}
        href={href}
        transitionTypes={dir}
        onNavigate={() => onTap(href)}
        aria-label={label}
        aria-current={active ? 'page' : undefined}
        className={cx(
          // Ikona zawsze 12 px od lewej: stoi w miejscu, gdy nazwa się zwija i rozwija.
          'press relative flex h-11 items-center gap-1.5 overflow-hidden rounded-full pl-3',
          active ? 'bg-active pr-3.5 text-accent' : 'w-11 text-muted hover:text-text',
        )}
      >
        <Icon className="size-5 shrink-0" aria-hidden="true" strokeWidth={1.8} />
        <span
          className={cx(
            'text-sm font-bold whitespace-nowrap transition-opacity duration-150',
            !active && 'opacity-0',
          )}
        >
          {label}
        </span>
      </Link>
    </li>
  )
}

/** Ostatni człon ścieżki widoku wyjazdu, także pogody (zostaje przy przełączeniu wyjazdu). */
function tripView(pathname: string): string | undefined {
  return /^\/trips\/[\w-]+\/(\w+)$/.exec(pathname)?.[1]
}

/** Flaga wyjazdu w środku menu i lista wyjazdów nad nią. */
function TripSwitch({
  trips,
  current,
  view,
  inTrip,
}: {
  trips: NavTrip[]
  current?: string
  view?: string
  inTrip: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useDismiss(open, () => setOpen(false), ref)
  const exit = useExit('pop')
  const trip = trips.find((t) => t.id === current)
  if (!trip) return null
  return (
    <div ref={ref} className="trip-switch relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`wyjazd: ${trip.title} · zmień`}
        title={trip.title}
        className="press flex size-14 items-center justify-center rounded-full border-2 border-accent bg-raised shadow-float"
      >
        {trip.flag ?? <Luggage className="size-5 text-accent" aria-hidden="true" />}
      </button>
      {open && (
        <div
          ref={exit}
          role="menu"
          aria-label="wyjazdy"
          className="island pop-menu shadow-float absolute bottom-[calc(100%+8px)] left-1/2 origin-bottom flex w-64 -translate-x-1/2 flex-col p-1"
        >
          <p className="px-3 pt-1.5 pb-1 text-xs text-subtle italic">menu prowadzi do</p>
          {trips.map((t) => (
            <Link
              key={t.id}
              role="menuitem"
              href={`/trips/${t.id}/${view ?? 'today'}`}
              onClick={() => setOpen(false)}
              aria-current={t.id === current ? 'true' : undefined}
              className={cx(
                'flex min-h-11 items-center gap-2.5 rounded-inner px-3 py-1.5',
                t.id === current ? 'bg-active text-accent' : 'hover:bg-raised',
              )}
            >
              <span className="flex w-6 shrink-0 justify-center">
                {t.flag ?? <Luggage className="size-4 text-subtle" aria-hidden="true" />}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-bold">{t.title}</span>
                <span className="truncate text-xs text-subtle">{t.sub}</span>
              </span>
            </Link>
          ))}
          {inTrip && (
            <Link
              role="menuitem"
              href="/trips"
              onClick={() => setOpen(false)}
              className="flex min-h-11 items-center px-3 text-sm text-muted hover:text-accent"
            >
              wszystkie wyjazdy ›
            </Link>
          )}
        </div>
      )}
    </div>
  )
}

'use client'

import 'maplibre-gl/dist/maplibre-gl.css'
import {
  bearing,
  CARD_TYPE_LABELS,
  type CardType,
  type DayGap,
  dayRoute,
  decodePolyline,
  formatDayHeader,
  formatShortDate,
  hasCoords,
  type LegPlan,
  type MappedCard,
  mapDays,
  navigationUrl,
  todayLocal,
} from '@planer/core'
import { ChevronLeft, ChevronRight, Navigation, SquarePen } from 'lucide-react'
import type { GeoJSONSource, Map as MapLibreMap, Marker } from 'maplibre-gl'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ChatButton } from '@/components/ai/chat-panel'
import { fieldsSummary } from '@/components/card/card-fields'
import { CardSheet } from '@/components/card/card-sheet'
import { TYPE_STYLE } from '@/components/card/type-style'
import { InboxButton } from '@/components/inbox/inbox-button'
import { TopBar, TRIPS_BACK } from '@/components/top-bar'
import { SessionBanner, TripStatus } from '@/components/trip-status'
import { cx } from '@/components/ui'
import { useCardSheet } from '@/lib/use-card-sheet'
import { useDayPlans } from '@/lib/use-day-plans'
import { useCards, useTrip } from '@/lib/yjs/trip-doc'
import { cssVar, useMapStyle } from './map-style'
import { loadMapLibre } from './maplibre'

const TYPE_VAR: Record<CardType, string> = {
  stay: '--plum',
  sight: '--amber',
  food: '--green',
  transport: '--blue',
  note: '--teal',
}

const ROUTE_SOURCE = 'day-route'

// Rodzaje linii trasy dnia: komunikacja ciągła, pieszo w kropki, plan bez wyniku przerywany.
const ROUTE_KINDS = ['plan', 'walk', 'drive', 'transit'] as const
type RouteKind = (typeof ROUTE_KINDS)[number]
const ROUTE_STYLE: Record<RouteKind, { color: string; label: string; dash?: number[] }> = {
  transit: { color: '--blue', label: 'komunikacja' },
  walk: { color: '--green', label: 'pieszo', dash: [0.5, 2] },
  drive: { color: '--plum', label: 'autem' },
  plan: { color: '--subtle', label: 'bez wyniku', dash: [1.5, 2] },
}

const lineFeature = (kind: RouteKind, coordinates: number[][]) => ({
  type: 'Feature' as const,
  properties: { kind },
  geometry: { type: 'LineString' as const, coordinates },
})

/** Linie trasy dnia: każdy krok w swoim kolorze; bez planu prosta między punktami. */
function routeFeatures(legs: DayGap[], plans: Record<string, LegPlan | null>, stops: MappedCard[]) {
  const features = legs.flatMap((leg) => {
    const plan = plans[leg.id]
    if (!leg.route) return []
    if (!plan)
      return [
        lineFeature('plan', [
          [leg.route.from.lng, leg.route.from.lat],
          [leg.route.to.lng, leg.route.to.lat],
        ]),
      ]
    const steps = plan.steps.flatMap((s) =>
      (s.lines ?? []).map((l) =>
        lineFeature(s.kind === 'transit' ? 'transit' : 'walk', decodePolyline(l)),
      ),
    )
    if (steps.length) return steps
    return plan.polyline ? [lineFeature(plan.mode, decodePolyline(plan.polyline))] : []
  })
  if (features.length) return features
  return stops.length > 1
    ? [
        lineFeature(
          'plan',
          stops.map((c) => [c.location.lng, c.location.lat]),
        ),
      ]
    : []
}

type Tab = 'all' | string

const CLUSTER_PX = 34

/** Łączy pinezki bliższe niż CLUSTER_PX na ekranie przy obecnym przybliżeniu. */
function groupNearby<T extends { card: MappedCard }>(m: MapLibreMap, pins: T[]): T[][] {
  const groups: { x: number; y: number; items: T[] }[] = []
  for (const pin of pins) {
    const { x, y } = m.project([pin.card.location.lng, pin.card.location.lat])
    const near = groups.find((g) => Math.hypot(g.x - x, g.y - y) < CLUSTER_PX)
    if (near) near.items.push(pin)
    else groups.push({ x, y, items: [pin] })
  }
  return groups.map((g) => g.items)
}

export function TripMap() {
  const { trip } = useTrip()
  const cards = useCards()
  const sheet = useCardSheet()
  const style = useMapStyle()
  const today = todayLocal()
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<MapLibreMap | null>(null)
  const markers = useRef<Marker[]>([])
  const [loaded, setLoaded] = useState(false)
  const [tab, setTab] = useState<Tab>('all')
  const [selected, setSelected] = useState<string | null>(null)
  const [zoom, setZoom] = useState(0)

  const days = useMemo(() => mapDays(cards, trip), [cards, trip])
  const live = useMemo(() => cards.filter((c) => !c.deletedAt), [cards])
  const route = useMemo(() => (tab === 'all' ? null : dayRoute(cards, tab)), [cards, tab])
  const dayPlans = useDayPlans(tab === 'all' ? null : tab)

  // Pinezki widoku: wszystkie miejsca albo trasa dnia (z numerami).
  const pins = useMemo(() => {
    if (!route)
      return live
        .filter(hasCoords)
        .map((card) => ({ card, label: undefined as string | undefined }))
    return [
      ...(route.start ? [{ card: route.start, label: '⌂' }] : []),
      ...route.stops.map((card, i) => ({ card, label: String(i + 1) })),
    ]
  }, [live, route])

  // ---------- mapa (jedna instancja) ----------
  useEffect(() => {
    let cancelled = false
    void loadMapLibre().then(({ Map, AttributionControl }) => {
      if (cancelled || !container.current || map.current) return
      const m = new Map({
        container: container.current,
        style,
        center: [12.5, 41.9],
        zoom: 4,
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
      })
      m.touchZoomRotate.disableRotation()
      m.addControl(new AttributionControl({ compact: true }), 'bottom-left')
      m.on('load', () => setLoaded(true))
      m.on('zoomend', () => setZoom(m.getZoom()))
      m.on('click', () => setSelected(null))
      map.current = m
    })
    return () => {
      cancelled = true
      map.current?.remove()
      map.current = null
      setLoaded(false)
    }
    // Jedna mapa na cały widok; styl (motyw) zmienia się niżej przez setStyle.
  }, [])

  useEffect(() => {
    const m = map.current
    if (!m || !loaded) return
    m.setStyle(style)
  }, [style, loaded])

  // ---------- pinezki ----------
  useEffect(() => {
    const m = map.current
    if (!m || !loaded) return
    let cancelled = false
    void loadMapLibre().then(({ Marker, LngLatBounds }) => {
      if (cancelled) return
      for (const marker of markers.current) marker.remove()
      // Widok wszystkich miejsc: pinezki leżące na sobie łączą się w grupę z liczbą.
      const groups = route ? pins.map((p) => [p]) : groupNearby(m, pins)
      markers.current = groups.map((group) => {
        const { card, label } = group[0] as (typeof pins)[number]
        if (group.length > 1) {
          const el = document.createElement('button')
          el.type = 'button'
          el.className = 'map-cluster'
          el.textContent = String(group.length)
          el.setAttribute('aria-label', `${group.length} miejsc, przybliż`)
          el.addEventListener('click', (e) => {
            e.stopPropagation()
            const bounds = new LngLatBounds()
            for (const p of group) bounds.extend([p.card.location.lng, p.card.location.lat])
            m.fitBounds(bounds, { padding: 90, maxZoom: 17, duration: 350 })
          })
          return new Marker({ element: el })
            .setLngLat([card.location.lng, card.location.lat])
            .addTo(m)
        }
        const el = document.createElement('button')
        el.type = 'button'
        el.className = cx('map-pin', selected === card.id && 'is-active')
        el.style.setProperty('--pin', `var(${TYPE_VAR[card.type]})`)
        el.setAttribute('aria-label', card.title || card.location.name)
        const shape = document.createElement('div')
        shape.className = 'map-pin__shape'
        if (label) {
          const span = document.createElement('span')
          span.textContent = label
          shape.append(span)
        }
        el.append(shape)
        el.addEventListener('click', (e) => {
          e.stopPropagation()
          setSelected(card.id)
        })
        return new Marker({ element: el, anchor: 'bottom' })
          .setLngLat([card.location.lng, card.location.lat])
          .addTo(m)
      })
    })
    return () => {
      cancelled = true
    }
  }, [pins, route, loaded, selected, zoom])

  // ---------- trasa dnia: przerywana linia w akcencie + strzałki kierunku ----------
  const arrows = useRef<Marker[]>([])
  useEffect(() => {
    const m = map.current
    if (!m || !loaded) return
    const stops: MappedCard[] = route ? [...(route.start ? [route.start] : []), ...route.stops] : []
    const features = routeFeatures(dayPlans.legs, dayPlans.plans, stops)
    const lines = features.filter((f) => f.properties.kind !== 'plan')

    const draw = () => {
      const data = { type: 'FeatureCollection' as const, features }
      const source = m.getSource(ROUTE_SOURCE) as GeoJSONSource | undefined
      if (source) source.setData(data)
      else m.addSource(ROUTE_SOURCE, { type: 'geojson', data })
      for (const kind of ROUTE_KINDS) {
        const id = `${ROUTE_SOURCE}-${kind}`
        if (m.getLayer(id)) continue
        const { color, dash } = ROUTE_STYLE[kind]
        m.addLayer({
          id,
          type: 'line',
          source: ROUTE_SOURCE,
          filter: ['==', ['get', 'kind'], kind],
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': cssVar(color),
            'line-width': kind === 'transit' ? 4 : 3,
            ...(dash && { 'line-dasharray': dash }),
          },
        })
      }
    }
    // Przy dociąganiu kafelków isStyleLoaded() bywa fałszywe, a plan dnia przychodzi właśnie wtedy.
    if (m.getSource(ROUTE_SOURCE) || m.isStyleLoaded()) draw()
    else m.once('idle', draw)
    m.on('style.load', draw)

    let cancelled = false
    void loadMapLibre().then(({ Marker }) => {
      if (cancelled) return
      for (const a of arrows.current) a.remove()
      // Strzałki stoją w połowie prostej, więc przy prawdziwym przebiegu wisiałyby obok trasy.
      arrows.current = (lines.length ? [] : stops.slice(1)).map((to, i) => {
        const from = stops[i] as MappedCard
        const el = document.createElement('div')
        el.className = 'map-arrow'
        return new Marker({
          element: el,
          rotation: bearing(from.location, to.location),
          rotationAlignment: 'map',
        })
          .setLngLat([
            (from.location.lng + to.location.lng) / 2,
            (from.location.lat + to.location.lat) / 2,
          ])
          .addTo(m)
      })
    })
    return () => {
      cancelled = true
      m.off('style.load', draw)
      m.off('idle', draw)
    }
  }, [route, loaded, dayPlans.plans, dayPlans.legs])

  // Kadr na widoczne pinezki przy zmianie zakładki (i po pierwszym wczytaniu).
  const fittedTab = useRef<string | null>(null)
  useEffect(() => {
    const m = map.current
    if (!m || !loaded || !pins.length || fittedTab.current === tab) return
    fittedTab.current = tab
    void loadMapLibre().then(({ LngLatBounds }) => {
      const bounds = new LngLatBounds()
      for (const { card } of pins) bounds.extend([card.location.lng, card.location.lat])
      m.fitBounds(bounds, {
        padding: { top: 140, bottom: 220, left: 48, right: 48 },
        maxZoom: 15,
        duration: 300,
      })
    })
  }, [pins, tab, loaded])

  const legendKinds = useMemo(() => {
    if (!route) return []
    const stops = [...(route.start ? [route.start] : []), ...route.stops]
    const found = new Set(
      routeFeatures(dayPlans.legs, dayPlans.plans, stops).map((f) => f.properties.kind),
    )
    return ROUTE_KINDS.filter((k) => found.has(k))
  }, [route, dayPlans.legs, dayPlans.plans])

  // Strzałki jak na Tablicy: pierwsze naciśnięcie dzisiejszy dzień, potem kolejne dni z miejscami.
  const jump = (step: number) => {
    const dates = days.filter((d) => d.hasPlaces).map((d) => d.date)
    if (!dates.length) return
    const index = dates.indexOf(tab)
    const start = dates.findIndex((d) => d >= today)
    const next = index === -1 ? (start === -1 ? dates.length - 1 : start) : index + step
    setTab(dates[Math.min(dates.length - 1, Math.max(0, next))] as string)
    setSelected(null)
  }

  const selectedCard = live.find((c) => c.id === selected)
  const offMap = route?.offMap ?? []
  const tabs: { id: Tab; label: string; dot?: boolean }[] = [
    { id: 'all', label: 'wszystkie' },
    { id: today, label: 'dziś', dot: days.find((d) => d.date === today)?.hasPlaces },
    ...days
      .filter((d) => d.date !== today)
      .map((d) => ({
        id: d.date,
        // Bez miesiąca: „pt. 6”, żeby na telefonie mieściło się więcej dni.
        label: formatDayHeader(d.date).replace(',', '').split(' ').slice(0, 2).join(' '),
        dot: d.hasPlaces,
      })),
  ]

  return (
    <>
      <div inert={!!sheet.openId} className="fixed inset-0">
        <div className="absolute inset-0 bg-bg">
          {/* MapLibre nadaje kontenerowi position: relative — rozmiar daje wrapper. */}
          <div ref={container} className="size-full" />
        </div>

        <div className="pointer-events-none absolute inset-x-px top-1 z-10 flex flex-col gap-1 [&>*]:pointer-events-auto">
          <TopBar
            theme={false}
            title={trip.title}
            back={TRIPS_BACK}
            morph={`trip-${trip.id}`}
            actions={
              <>
                <TripStatus />
                <ChatButton onOpenCard={(id) => sheet.open(id)} />
                <InboxButton />
              </>
            }
          />
          <div role="tablist" aria-label="dni" className="island flex gap-1 overflow-x-auto p-1">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => {
                  setSelected(null)
                  setTab(t.id)
                }}
                className={cx(
                  'relative flex h-9 shrink-0 flex-col items-center justify-center rounded-[9px] px-3 text-xs transition-colors',
                  tab === t.id ? 'bg-raised font-bold text-accent' : 'text-muted',
                )}
              >
                {t.label}
                <span
                  aria-hidden="true"
                  className={cx(
                    'absolute bottom-0.5 size-1 rounded-full',
                    t.dot ? 'bg-accent' : 'bg-transparent',
                  )}
                />
              </button>
            ))}
          </div>
        </div>

        {legendKinds.length > 0 && (
          <ul
            aria-label="legenda trasy"
            className="island absolute top-[112px] right-1 z-10 flex flex-col gap-1 px-2 py-1.5 text-[11px] text-muted"
          >
            {legendKinds.map((kind) => (
              <li key={kind} className="flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="w-5 border-t-[3px]"
                  style={{
                    borderColor: `var(${ROUTE_STYLE[kind].color})`,
                    borderTopStyle: ROUTE_STYLE[kind].dash ? 'dotted' : 'solid',
                  }}
                />
                {ROUTE_STYLE[kind].label}
              </li>
            ))}
          </ul>
        )}
        <SessionBanner />

        <div className="pointer-events-none absolute inset-x-px bottom-[calc(80px+env(safe-area-inset-bottom))] z-10 flex flex-col gap-1 [&>*]:pointer-events-auto">
          <div className="island flex items-center self-end">
            <button
              type="button"
              onClick={() => jump(-1)}
              aria-label="poprzedni dzień"
              className="flex size-11 items-center justify-center text-muted hover:text-accent"
            >
              <ChevronLeft className="size-5" aria-hidden="true" />
            </button>
            {tab !== 'all' && (
              <span className="px-1 text-xs whitespace-nowrap text-subtle">
                {formatShortDate(tab)}
              </span>
            )}
            <button
              type="button"
              onClick={() => jump(1)}
              aria-label="następny dzień"
              className="flex size-11 items-center justify-center text-muted hover:text-accent"
            >
              <ChevronRight className="size-5" aria-hidden="true" />
            </button>
          </div>
          {selectedCard && hasCoords(selectedCard) && (
            <section className="island border-t-2 border-t-accent p-3">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">
                    {selectedCard.title || selectedCard.location.name}
                  </p>
                  <p className="truncate text-xs text-subtle italic">
                    {[
                      selectedCard.date && formatDayHeader(selectedCard.date),
                      fieldsSummary(selectedCard),
                      selectedCard.location.address,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                <span
                  className={cx(
                    'rounded-small px-2 py-0.5 text-[11px]',
                    TYPE_STYLE[selectedCard.type].chip,
                  )}
                >
                  {CARD_TYPE_LABELS[selectedCard.type]}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-1">
                <button
                  type="button"
                  onClick={() => sheet.open(selectedCard.id)}
                  className="flex min-h-11 items-center justify-center gap-1 rounded-small border border-line text-sm"
                >
                  <SquarePen className="size-4" aria-hidden="true" /> otwórz kartę
                </button>
                <a
                  href={navigationUrl(selectedCard.location)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex min-h-11 items-center justify-center gap-1 rounded-small bg-accent text-sm font-bold text-on-accent"
                >
                  <Navigation className="size-4" aria-hidden="true" /> nawiguj
                </a>
              </div>
            </section>
          )}
          {!selectedCard && offMap.length > 0 && (
            <section className="island max-h-40 overflow-y-auto p-3">
              <p className="text-xs text-subtle italic">poza mapą</p>
              {offMap.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => sheet.open(c.id)}
                  className="flex min-h-9 w-full items-center gap-2 text-left text-sm"
                >
                  <span className={cx('size-2 shrink-0 rounded-full', TYPE_STYLE[c.type].bar)} />
                  <span className="truncate">{c.title || 'bez tytułu'}</span>
                  {c.time && <span className="ml-auto text-xs text-subtle">{c.time}</span>}
                </button>
              ))}
            </section>
          )}
          {!selectedCard && !pins.length && (
            <p className="island p-3 text-sm text-muted">
              ●{' '}
              {tab === 'all'
                ? 'żadna karta nie ma jeszcze miejsca'
                : 'w tym dniu nie ma miejsc na mapie'}
            </p>
          )}
        </div>
      </div>
      {sheet.openId && (
        <CardSheet
          key={sheet.openId}
          cardId={sheet.openId}
          isNew={sheet.isNew}
          onClose={sheet.close}
        />
      )}
    </>
  )
}

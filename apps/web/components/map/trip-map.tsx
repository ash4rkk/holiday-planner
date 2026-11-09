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
  mainCluster,
  mapDays,
  navigationUrl,
  routeMarks,
  todayLocal,
  vehicleKind,
} from '@planer/core'
import { ChevronLeft, ChevronRight, Navigation, SquarePen } from 'lucide-react'
import type { GeoJSONSource, Map as MapLibreMap, MapMouseEvent, Marker } from 'maplibre-gl'
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChatButton } from '@/components/ai/chat-panel'
import { fieldsSummary } from '@/components/card/card-fields'
import { CardSheet } from '@/components/card/card-sheet'
import { TYPE_STYLE } from '@/components/card/type-style'
import { SearchButton } from '@/components/search/search-button'
import { TopBar, TRIPS_BACK } from '@/components/top-bar'
import { TripMenu, TripTitle } from '@/components/trip-menu'
import { SessionBanner, TripStatus } from '@/components/trip-status'
import { cx } from '@/components/ui'
import { useCardSheet } from '@/lib/use-card-sheet'
import { useDayPlans } from '@/lib/use-day-plans'
import { useWide } from '@/lib/use-wide'
import { useCards, useTrip } from '@/lib/yjs/trip-doc'
import { type CachedMap, keepMap, takeMap } from './map-cache'
import { cssVar, themeMap, useMapStyle } from './map-style'
import { loadMapLibre } from './maplibre'

const TYPE_VAR: Record<CardType, string> = {
  stay: '--plum',
  sight: '--teal',
  food: '--orange',
  transport: '--blue',
  note: '--subtle',
}

const ROUTE_SOURCE = 'day-route'

const ROUTE_MARKS = `${ROUTE_SOURCE}-marks`
const STOP_LAYER = `${ROUTE_MARKS}-stops`
const STOP_TAP_PX = 16
// Nazwy linii dopiero po przybliżeniu: na mapie całego dnia zasłoniłyby trasę.
const LINE_LABEL_ZOOM = 13

// Rodzaje linii trasy dnia: przejazdy ciągłe w kolorze pojazdu, pieszo w kropki, brak połączenia
// przerywany.
const ROUTE_KINDS = [
  'plan',
  'walk',
  'drive',
  'transit',
  'bus',
  'tram',
  'metro',
  'rail',
  'ferry',
] as const
type RouteKind = (typeof ROUTE_KINDS)[number]
const ROUTE_STYLE: Record<RouteKind, { color: string; label: string; dash?: number[] }> = {
  transit: { color: '--blue', label: 'komunikacja' },
  tram: { color: '--lavender', label: 'tramwaj' },
  metro: { color: '--blue', label: 'metro' },
  bus: { color: '--teal', label: 'autobus' },
  rail: { color: '--orange', label: 'pociąg' },
  // Linie tras bez kolorów stanów; prom jak metro, ale przerywany.
  ferry: { color: '--blue', label: 'prom', dash: [3, 1.5] },
  walk: { color: '--muted', label: 'pieszo', dash: [0.5, 2] },
  drive: { color: '--plum', label: 'autem' },
  plan: { color: '--subtle', label: 'brak połączenia', dash: [1.5, 2] },
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
        lineFeature(s.kind === 'transit' ? vehicleKind(s) : 'walk', decodePolyline(l)),
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
// Dymek nad pinezką i jego margines od nagłówka z dniami i dolnego menu.
const BUBBLE_OFFSET = 42
const BUBBLE_MARGIN = { top: 116, bottom: 130, side: 8 }

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
  // Pisanie w otwartej karcie ma pierwszeństwo; widok pod nią nadąża chwilę później.
  const cards = useDeferredValue(useCards())
  const sheet = useCardSheet()
  const wide = useWide()
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
  // W trakcie wyjazdu mapa zaczyna od dzisiejszej trasy; przed i po — od wszystkich miejsc.
  // Raz, gdy karty się wczytają (dokument Yjs przychodzi po pierwszym rysowaniu); wybór osoby
  // i zakładka zapamiętana z mapą wygrywają.
  const autoTab = useRef(true)
  useEffect(() => {
    if (!autoTab.current || !days.some((d) => d.hasPlaces)) return
    autoTab.current = false
    if (days.some((d) => d.date === today && d.hasPlaces)) setTab(today)
  }, [days, today])
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
      ...(route.end ? [{ card: route.end, label: '⌂' }] : []),
    ]
  }, [live, route])

  // ---------- mapa (jedna na wyjazd, zachowana między wejściami na widok) ----------
  const entry = useRef<CachedMap | null>(null)
  useEffect(() => {
    let cancelled = false
    // Nasłuch per wejście na widok: stan tego komponentu, nie poprzedniego.
    const onLoad = () => setLoaded(true)
    const onZoom = () => map.current && setZoom(map.current.getZoom())
    const onClick = () => setSelected(null)
    const attach = (e: CachedMap) => {
      container.current?.append(e.element)
      entry.current = e
      map.current = e.map
      e.map.on('load', onLoad)
      e.map.on('zoomend', onZoom)
      e.map.on('click', onClick)
      e.map.resize()
      setZoom(e.map.getZoom())
      if (e.map.isStyleLoaded()) setLoaded(true)
    }
    const reused = takeMap(trip.id)
    if (reused) {
      fittedTab.current = reused.tab
      autoTab.current = false
      setTab(reused.tab as Tab)
      attach(reused)
    } else
      void loadMapLibre().then(({ Map, AttributionControl }) => {
        if (cancelled || !container.current || map.current) return
        const element = document.createElement('div')
        element.className = 'size-full'
        container.current.append(element)
        const m = new Map({
          container: element,
          style,
          center: [12.5, 41.9],
          zoom: 4,
          attributionControl: false,
          dragRotate: false,
          pitchWithRotate: false,
        })
        m.touchZoomRotate.disableRotation()
        m.addControl(new AttributionControl({ compact: true }), 'bottom-left')
        themeMap(m)
        attach({ tripId: trip.id, element, map: m, style, tab: 'all' })
      })
    return () => {
      cancelled = true
      const e = entry.current
      const m = map.current
      if (m) {
        m.off('load', onLoad)
        m.off('zoomend', onZoom)
        m.off('click', onClick)
      }
      // Pinezki i strzałki rysuje widok — zdejmujemy je, żeby po powrocie się nie dublowały.
      for (const marker of markers.current) marker.remove()
      for (const a of arrows.current) a.remove()
      markers.current = []
      arrows.current = []
      if (e) keepMap({ ...e, tab: tabRef.current })
      entry.current = null
      map.current = null
      setLoaded(false)
    }
    // Jedna mapa na wyjazd; styl (motyw) zmienia się niżej przez setStyle.
  }, [trip.id])

  // Zakładka dnia wraca razem z mapą.
  const tabRef = useRef(tab)
  tabRef.current = tab

  useEffect(() => {
    const m = map.current
    const e = entry.current
    if (!m || !e || !loaded || e.style === style) return
    e.style = style
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
        // Podpowiedź po najechaniu: szybki przegląd dnia bez klikania.
        el.title = [card.title || card.location.name, card.time].filter(Boolean).join(' · ')
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
    const stops: MappedCard[] = route
      ? [...(route.start ? [route.start] : []), ...route.stops, ...(route.end ? [route.end] : [])]
      : []
    const features = routeFeatures(dayPlans.legs, dayPlans.plans, stops)
    const lines = features.filter((f) => f.properties.kind !== 'plan')
    const marks = dayPlans.legs.flatMap((leg) => {
      const plan = dayPlans.plans[leg.id]
      return plan ? routeMarks(plan) : []
    })

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
            'line-width': kind === 'walk' || kind === 'plan' ? 3 : 4,
            ...(dash && { 'line-dasharray': dash }),
          },
        })
      }
      const points = {
        type: 'FeatureCollection' as const,
        features: marks.map(({ lng, lat, ...properties }) => ({
          type: 'Feature' as const,
          properties: {
            ...properties,
            color: 'kind' in properties ? cssVar(ROUTE_STYLE[properties.kind].color) : undefined,
          },
          geometry: { type: 'Point' as const, coordinates: [lng, lat] },
        })),
      }
      const marksSource = m.getSource(ROUTE_MARKS) as GeoJSONSource | undefined
      if (marksSource) marksSource.setData(points)
      else m.addSource(ROUTE_MARKS, { type: 'geojson', data: points })
      if (!m.getLayer(STOP_LAYER)) {
        m.addLayer({
          id: STOP_LAYER,
          type: 'circle',
          source: ROUTE_MARKS,
          filter: ['==', ['get', 'type'], 'stop'],
          paint: {
            'circle-radius': 6,
            'circle-color': cssVar('--text'),
            'circle-stroke-color': cssVar('--panel'),
            'circle-stroke-width': 2,
          },
        })
        m.addLayer({
          id: `${ROUTE_MARKS}-lines`,
          type: 'symbol',
          source: ROUTE_MARKS,
          minzoom: LINE_LABEL_ZOOM,
          filter: ['==', ['get', 'type'], 'line'],
          layout: {
            'text-field': ['get', 'text'],
            'text-font': ['Noto Sans Regular'],
            'text-size': 13,
            'text-offset': [0, -1],
          },
          paint: {
            'text-color': ['get', 'color'],
            'text-halo-color': cssVar('--panel'),
            'text-halo-width': 2,
          },
        })
      }
    }
    // Przy dociąganiu kafelków isStyleLoaded() bywa fałszywe, a plan dnia przychodzi właśnie wtedy.
    if (m.getSource(ROUTE_SOURCE) || m.isStyleLoaded()) draw()
    else m.once('idle', draw)
    m.on('style.load', draw)

    // Tap w przystanek: dymek z linią i godziną. Kropka jest mała, więc łapiemy też jej okolicę.
    let popup: import('maplibre-gl').Popup | undefined
    const tapStop = (e: MapMouseEvent) => {
      if (!m.getLayer(STOP_LAYER)) return
      const { x, y } = e.point
      const [stop] = m.queryRenderedFeatures(
        [
          [x - STOP_TAP_PX, y - STOP_TAP_PX],
          [x + STOP_TAP_PX, y + STOP_TAP_PX],
        ],
        { layers: [STOP_LAYER] },
      )
      if (!stop) return
      const { title, detail } = stop.properties as { title: string; detail: string }
      const body = document.createElement('div')
      body.append(
        Object.assign(document.createElement('strong'), { textContent: title }),
        ...String(detail)
          .split('\n')
          .map((line) => Object.assign(document.createElement('div'), { textContent: line })),
      )
      void loadMapLibre().then(({ Popup }) => {
        popup?.remove()
        popup = new Popup({ closeButton: false, offset: 10 })
          .setLngLat((stop.geometry as unknown as { coordinates: [number, number] }).coordinates)
          .setDOMContent(body)
          .addTo(m)
      })
    }
    m.on('click', tapStop)

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
      m.off('click', tapStop)
      popup?.remove()
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
      // „Wszystkie”: kadr na największe skupisko; pojedyncze dalekie miejsca widać po oddaleniu.
      const shown = tab === 'all' ? mainCluster(pins.map((p) => p.card.location)) : null
      for (const p of shown ?? pins.map((p) => p.card.location)) bounds.extend([p.lng, p.lat])
      m.fitBounds(bounds, {
        padding: { top: 140, bottom: 220, left: 48, right: 48 },
        maxZoom: 15,
        duration: 300,
      })
    })
  }, [pins, tab, loaded])

  const legendKinds = useMemo(() => {
    if (!route) return []
    const stops = [
      ...(route.start ? [route.start] : []),
      ...route.stops,
      ...(route.end ? [route.end] : []),
    ]
    const found = new Set(
      routeFeatures(dayPlans.legs, dayPlans.plans, stops).map((f) => f.properties.kind),
    )
    return ROUTE_KINDS.filter((k) => found.has(k))
  }, [route, dayPlans.legs, dayPlans.plans])

  const hasStops =
    Boolean(route) &&
    dayPlans.legs.some((leg) => dayPlans.plans[leg.id]?.steps.some((s) => s.kind === 'transit'))

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

  // Dymek przy pinezce: treść wstawia React przez portal, a mapa dosuwa się, żeby nie wszedł pod paski.
  const [bubble, setBubble] = useState<HTMLDivElement | null>(null)
  const bubblePlace = selectedCard && hasCoords(selectedCard) ? selectedCard.location : undefined
  const bubbleLng = bubblePlace?.lng
  const bubbleLat = bubblePlace?.lat
  useEffect(() => {
    const m = map.current
    if (!m || bubbleLng === undefined || bubbleLat === undefined) return
    let popup: import('maplibre-gl').Popup | undefined
    let cancelled = false
    const body = document.createElement('div')
    void loadMapLibre().then(({ Popup }) => {
      if (cancelled) return
      popup = new Popup({
        // Stała strona: dymek zawsze nad pinezką, a mapa sama się dosuwa.
        anchor: 'bottom',
        closeButton: false,
        closeOnClick: false,
        focusAfterOpen: false,
        maxWidth: '300px',
        offset: BUBBLE_OFFSET,
      })
        .setLngLat([bubbleLng, bubbleLat])
        .setDOMContent(body)
        .addTo(m)
      setBubble(body)
    })
    return () => {
      cancelled = true
      popup?.remove()
      setBubble(null)
    }
  }, [bubbleLng, bubbleLat])
  // Pomiar dopiero z treścią dymka: wcześniej jest pusty i wąski.
  useEffect(() => {
    const m = map.current
    if (!m || !bubble) return
    const frame = requestAnimationFrame(() => {
      const box = m.getContainer().getBoundingClientRect()
      const r = (bubble.closest('.maplibregl-popup-content') ?? bubble).getBoundingClientRect()
      const dy =
        Math.min(0, box.bottom - BUBBLE_MARGIN.bottom - r.bottom) ||
        Math.max(0, box.top + BUBBLE_MARGIN.top - r.top)
      const dx =
        Math.min(0, box.right - BUBBLE_MARGIN.side - r.right) ||
        Math.max(0, box.left + BUBBLE_MARGIN.side - r.left)
      if (dx || dy) m.panBy([-dx, -dy], { duration: 250 })
    })
    return () => cancelAnimationFrame(frame)
  }, [bubble])
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
      <div inert={!!sheet.openId && !wide} className="fixed inset-0">
        <div className="trip-map absolute inset-0 bg-bg">
          {/* MapLibre nadaje kontenerowi position: relative — rozmiar daje wrapper. */}
          <div ref={container} className="size-full" />
        </div>

        <div className="pointer-events-none absolute inset-x-px top-1 z-(--z-overlay) flex flex-col gap-1 [&>*]:pointer-events-auto">
          <TopBar
            title={<TripTitle />}
            back={TRIPS_BACK}
            morph={`trip-${trip.id}`}
            menu={<TripMenu />}
            actions={
              <>
                <SearchButton onOpenCard={(id) => sheet.open(id)} />
                <ChatButton onOpenCard={(id) => sheet.open(id)} />
                <TripStatus />
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
                  autoTab.current = false
                  setTab(t.id)
                }}
                className={cx(
                  'hit flex h-9 shrink-0 flex-col items-center justify-center rounded-inner px-3 text-xs transition-colors',
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
            className="island absolute top-[112px] right-1 z-(--z-overlay) flex flex-col gap-1 px-2 py-1.5 text-2xs text-muted"
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
            {hasStops && (
              <li className="flex items-center gap-1.5">
                <span aria-hidden="true" className="flex w-5 justify-center">
                  <span className="size-2.5 rounded-full border border-panel bg-text" />
                </span>
                przystanek
              </li>
            )}
          </ul>
        )}
        {bubble &&
          selectedCard &&
          hasCoords(selectedCard) &&
          createPortal(
            <div className="flex w-64 flex-col gap-1 text-text">
              <div className="flex items-start gap-2">
                <p className="min-w-0 flex-1 truncate text-sm font-bold">
                  {selectedCard.title || selectedCard.location.name}
                </p>
                <span
                  className={cx(
                    'shrink-0 rounded-small px-2 py-0.5 text-2xs',
                    TYPE_STYLE[selectedCard.type].chip,
                  )}
                >
                  {CARD_TYPE_LABELS[selectedCard.type]}
                </span>
              </div>
              <p className="text-xs text-subtle">
                {[
                  selectedCard.date && formatDayHeader(selectedCard.date),
                  fieldsSummary(selectedCard),
                  selectedCard.location.address,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              <div className={cx('mt-1 grid grid-cols-2 gap-1', wide && '[direction:rtl]')}>
                <a
                  href={navigationUrl(selectedCard.location)}
                  target="_blank"
                  rel="noreferrer"
                  className={cx(
                    'flex min-h-11 items-center justify-center gap-1 rounded-small text-sm [direction:ltr]',
                    wide
                      ? 'border border-line text-text'
                      : 'order-last bg-accent font-bold text-on-accent',
                  )}
                >
                  <Navigation className="size-4" aria-hidden="true" /> nawiguj
                </a>
                <button
                  type="button"
                  onClick={() => sheet.open(selectedCard.id)}
                  className={cx(
                    'flex min-h-11 items-center justify-center gap-1 rounded-small text-sm [direction:ltr]',
                    wide ? 'bg-accent font-bold text-on-accent' : 'border border-line text-text',
                  )}
                >
                  <SquarePen className="size-4" aria-hidden="true" /> otwórz
                </button>
              </div>
            </div>,
            bubble,
          )}

        <SessionBanner />

        <div className="pointer-events-none absolute inset-x-px bottom-[calc(80px+env(safe-area-inset-bottom))] z-(--z-overlay) flex flex-col gap-1 [&>*]:pointer-events-auto">
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
          {offMap.length > 0 && (
            <section className="island max-h-40 overflow-y-auto p-3">
              <p className="text-xs text-subtle">poza mapą</p>
              {offMap.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => sheet.open(c.id)}
                  className="flex min-h-11 w-full items-center gap-2 text-left text-sm"
                >
                  <span className={cx('size-2 shrink-0 rounded-full', TYPE_STYLE[c.type].bar)} />
                  <span className="truncate">{c.title || 'bez tytułu'}</span>
                  {c.time && <span className="ml-auto text-xs text-subtle">{c.time}</span>}
                </button>
              ))}
            </section>
          )}
          {!pins.length && (
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
        <CardSheet cardId={sheet.openId} isNew={sheet.isNew} onClose={sheet.close} />
      )}
    </>
  )
}

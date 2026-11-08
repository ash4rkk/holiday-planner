'use client'

import '@xyflow/react/dist/base.css'
import type { DropColumn } from '@planer/core'
import {
  addDays,
  addVariant,
  arrangeByDays,
  CARD_SIZE,
  type CardSnapshot,
  cardIsPast,
  chooseVariant,
  createCard,
  createFrame,
  type DropTarget,
  dateRange,
  dayGaps,
  dayIndexOf,
  dayOrder,
  daysBetween,
  deleteEdge,
  deleteFrame,
  detachVariant,
  dropColumns,
  dropSlots,
  dropTarget,
  edgesOf,
  formatDayHeader,
  formatShortDate,
  framesOf,
  GRID,
  isBandStay,
  isIdea,
  type LegPlan,
  legIsPast,
  legShortfall,
  moveCardToDay,
  moveItems,
  moveToIdeas,
  nextStart,
  nowLineAt,
  type Positions,
  renameFrame,
  resizeFrame,
  restorePositions,
  roundClock,
  segmentHitsRect,
  setEdgeLabel,
  shiftClock,
  snapToGrid,
  stayTimes,
  TRAVEL_MODE_LABELS,
  todayLocal,
  trashCard,
  updateCard,
  variantsByMain,
  visibleEdges,
} from '@planer/core'
import {
  applyNodeChanges,
  Background,
  BackgroundVariant,
  type Node,
  type NodeChange,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Viewport,
} from '@xyflow/react'
import {
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  ClipboardPaste,
  Columns3,
  Plus,
  SquareDashed,
  SquarePlus,
  Undo2,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { extendTrip } from '@/app/(app)/trips/actions'
import { AddButton } from '@/components/add-button'
import { ChatButton } from '@/components/ai/chat-panel'
import { DraftReview, ImportRunner, ImportStatus } from '@/components/ai/import-ui'
import { CARD_PANEL_WIDTH, CardSheet } from '@/components/card/card-sheet'
import { askText, ConfirmDialog, DialogFrame } from '@/components/confirm-dialog'
import { TopBar, TRIPS_BACK } from '@/components/top-bar'
import { TripMenu, TripTitle } from '@/components/trip-menu'
import { SessionBanner, TripStatus } from '@/components/trip-status'
import { buttonClass, cx } from '@/components/ui'
import { enqueueImport, runImports } from '@/lib/ai-import'
import { countByCard } from '@/lib/attachment-counts'
import { createFromTemplate } from '@/lib/card-templates'
import { pasteAsCard } from '@/lib/place-card'
import { offerUndo, withUndo } from '@/lib/undo'
import { useCardSheet } from '@/lib/use-card-sheet'
import { useDayPlans } from '@/lib/use-day-plans'
import { useDismiss } from '@/lib/use-dismiss'
import { useTripNow } from '@/lib/use-trip-now'
import { useWide } from '@/lib/use-wide'
import { useAttachments, useCards, useEdges, useFrames, useTrip } from '@/lib/yjs/trip-doc'
import { type BoardApi, BoardContext, frameNodeId, type Selection } from './board-context'
import { CardMenu } from './card-menu'
import { CardNode } from './card-node'
import { DayNode } from './day-node'
import { FrameNode } from './frame-node'
import { controlsBottom, type IdeaDrag, IdeasDrawer, PANEL_WIDTH } from './ideas-drawer'
import { DropNode, NowNode, SlotNode } from './now-node'
import { RemotePointers } from './remote-pointers'
import { OrderEdge, SketchEdge } from './sketch-edge'
import { StayNode } from './stay-node'
import { VariantNode } from './variant-node'

const nodeTypes = {
  card: CardNode,
  frame: FrameNode,
  day: DayNode,
  now: NowNode,
  drop: DropNode,
  variant: VariantNode,
  stay: StayNode,
  slot: SlotNode,
}
const edgeTypes = { sketch: SketchEdge, order: OrderEdge }
// Margines wysepki dnia wokół kart: z lewej kolumna godzin, u góry nagłówek dnia.
const DAY_PAD = { left: 64, right: 28, top: 44, bottom: 20 }
// Najmniejszy odstęp między ramkami dni.
const DAY_SPACE = 28
// Belki noclegów nad dniami: wysokość i odstęp między rzędami.
const STAY_H = 40
const STAY_GAP = 8
const HOLD_MENU_MS = 500
// Rozgałęzienie: warianty w pełnym rozmiarze obok karty głównej; kolejne dni odsuwają się w bok.
const BRANCH_GAP = GRID
// Przy krawędzi ekranu przeciągany pomysł przesuwa tablicę.
const EDGE_PX = 48
const EDGE_STEP = 10
const PANEL_KEY = 'planer-ideas-panel'
// Kadr na dzień: miejsce pod nagłówkiem i nad menu, najmniejszy czytelny zoom, wysokość linii „teraz”.
const FOCUS = { side: 8, top: 64, bottom: 130, readableZoom: 0.6, nowAt: 0.35 }

type Drop = DropTarget | { kind: 'ideas' } | null
type Placed = { id: string; date: string; time: string; undo: () => void }

export function Board() {
  return (
    <ReactFlowProvider>
      <BoardCanvas />
    </ReactFlowProvider>
  )
}

function readViewport(tripId: string): Viewport | undefined {
  try {
    const raw = localStorage.getItem(`planer-viewport-${tripId}`)
    return raw ? (JSON.parse(raw) as Viewport) : undefined
  } catch {
    return undefined
  }
}

/** Plan jednego dnia dla strzałek; osobny komponent, bo dni jest zmienna liczba. */
function DayPlans({
  date,
  onPlans,
}: {
  date: string
  onPlans: (plans: Record<string, LegPlan | null>) => void
}) {
  const { plans } = useDayPlans(date)
  useEffect(() => onPlans(plans), [plans, onPlans])
  return null
}

function BoardCanvas() {
  const { trip, doc, ready, provider, templates } = useTrip()
  const cards = useCards()
  const frames = useFrames()
  const edges = useEdges()
  const sheet = useCardSheet()
  const rf = useReactFlow()
  const [selection, setSelection] = useState<Selection>(null)
  // Kilka kart zebranych Ctrl albo Shift; przeciągnięcie jednej przesuwa wszystkie.
  const [group, setGroup] = useState<ReadonlySet<string>>(new Set())
  const [nodes, setNodes] = useState<Node[]>([])
  const [menu, setMenu] = useState<{ x: number; y: number; flow: { x: number; y: number } } | null>(
    null,
  )
  const menuRef = useRef<HTMLDivElement>(null)
  useDismiss(!!menu, () => setMenu(null), menuRef)
  const [undo, setUndo] = useState<Positions | null>(null)
  const [arranging, setArranging] = useState(false)
  const [legPlans, setLegPlans] = useState<Record<string, LegPlan | null>>({})
  const addPlans = useCallback(
    (plans: Record<string, LegPlan | null>) => setLegPlans((all) => ({ ...all, ...plans })),
    [],
  )
  const [savedViewport] = useState(() =>
    typeof window === 'undefined' ? undefined : readViewport(trip.id),
  )
  const drag = useRef<{
    start: Map<string, { x: number; y: number }>
    dx: number
    dy: number
    /** Przeciągany element: to on trafia w oczko siatki, reszta przesuwa się o tyle samo. */
    lead: string
    card?: CardSnapshot
  } | null>(null)

  const live = useMemo(() => cards.filter((c) => !c.deletedAt), [cards])
  const ideas = useMemo(
    () => live.filter(isIdea).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [live],
  )
  const variants = useMemo(() => variantsByMain(live), [live])
  // Noclegi z datą nie stoją w kolumnach dni — są belkami nad dniami (stayNodes).
  const onBoard = useMemo(
    () => live.filter((c) => !c.variantOf && !isIdea(c) && !isBandStay(c)),
    [live],
  )
  const wide = useWide()
  // Szeroki ekran zawsze rozgałęzia; stos jest tylko na telefonie.
  const branches = useCallback((c: CardSnapshot) => wide && variants.has(c.id), [wide, variants])
  /** Ile miejsca w prawo zajmują warianty karty. */
  const branchWidth = useCallback(
    (c: CardSnapshot) =>
      branches(c) ? (variants.get(c.id)?.length ?? 0) * ((c.w ?? CARD_SIZE.w) + BRANCH_GAP) : 0,
    [branches, variants],
  )
  const attachments = useAttachments()
  const fileCounts = useMemo(() => countByCard(attachments), [attachments])

  // Węzły z dokumentu; zachowują zmierzone rozmiary, a przeciągane — lokalną pozycję.
  useEffect(() => {
    setNodes((prev) => {
      const prevById = new Map(prev.map((n) => [n.id, n]))
      const next: Node[] = [
        ...frames.map(
          (f): Node => ({
            id: frameNodeId(f.id),
            type: 'frame',
            position: { x: f.x, y: f.y },
            width: f.w,
            height: f.h,
            zIndex: 0,
            selectable: false,
            draggable: false,
            style: { pointerEvents: 'none' },
            data: { frame: f },
          }),
        ),
        ...onBoard.map(
          (c): Node => ({
            id: c.id,
            type: 'card',
            position: { x: c.x, y: c.y },
            width: c.w ?? CARD_SIZE.w,
            height: c.h ?? CARD_SIZE.h,
            zIndex: 1,
            selectable: false,
            draggable: false,
            data: {
              card: c,
              files: fileCounts.get(c.id) ?? 0,
              options: variants.get(c.id) ?? [],
            },
          }),
        ),
      ]
      return next.map((n) => {
        const p = prevById.get(n.id)
        if (!p) return n
        const keep = drag.current?.start.has(n.id) || p.resizing
        return {
          ...n,
          measured: p.measured,
          ...(keep && {
            position: p.position,
            width: p.width,
            height: p.height,
            resizing: p.resizing,
          }),
        }
      })
    })
  }, [onBoard, variants, frames, fileCounts])

  const days = useMemo(() => dayOrder(live.filter((c) => !isBandStay(c))), [live])
  const now = useTripNow()

  // Stały odstęp między dniami, także w starych układach i przy rozgałęzieniach. Tylko przy
  // rysowaniu: pozycje w dokumencie są wspólne z telefonem, który pokazuje stos i niczego nie rozsuwa.
  const shiftAt = useMemo(() => {
    const columns = days
      .flatMap(({ ids }) => {
        const day = live.filter((c) => ids.includes(c.id))
        if (!day.length) return []
        return [
          {
            left: Math.min(...day.map((c) => c.x)),
            right: Math.max(...day.map((c) => c.x + (c.w ?? CARD_SIZE.w) + branchWidth(c))),
            top: Math.min(...day.map((c) => c.y)),
            bottom: Math.max(...day.map((c) => c.y + (c.h ?? CARD_SIZE.h))),
          },
        ]
      })
      .sort((a, b) => a.left - b.left)
    const steps: { from: number; by: number }[] = []
    let total = 0
    columns.forEach((column, i) => {
      const prev = columns[i - 1]
      // Dzień ułożony ręcznie wyżej albo niżej nie wymaga rozsuwania.
      if (!prev || column.top > prev.bottom || column.bottom < prev.top) return
      const edge = prev.right + total + DAY_PAD.right + DAY_SPACE
      const by = edge - (column.left + total - DAY_PAD.left)
      if (by <= 0) return
      steps.push({ from: column.left, by })
      total += by
    })
    return (x: number) => steps.reduce((sum, s) => (x >= s.from ? sum + s.by : sum), 0)
  }, [days, live, branchWidth])

  // W poszerzonym dniu węższe rzędy stoją na środku, więc oś dnia biegnie przez rozgałęzienie.
  const insets = useMemo(() => {
    const byCard = new Map<string, number>()
    for (const { ids } of days) {
      const day = live.filter((c) => ids.includes(c.id))
      const widest = Math.max(...day.map(branchWidth))
      if (widest) for (const c of day) byCard.set(c.id, (widest - branchWidth(c)) / 2)
    }
    return byCard
  }, [days, live, branchWidth])

  // Obrysy dni z bieżących pozycji węzłów (także w trakcie przeciągania).
  const dayNodes = useMemo(() => {
    const byId = new Map(nodes.map((n) => [n.id, n]))
    return days.flatMap(({ date, ids }): Node[] => {
      const boxes = ids.flatMap((id) => {
        const n = byId.get(id)
        if (!n) return []
        const card = (n.data as { card?: CardSnapshot }).card
        const w = n.width ?? CARD_SIZE.w
        const h = n.measured?.height ?? n.height ?? CARD_SIZE.h
        return [
          {
            x: n.position.x,
            y: n.position.y,
            r: n.position.x + w + (card ? branchWidth(card) : 0),
            b: n.position.y + h,
          },
        ]
      })
      if (!boxes.length) return []
      const left = Math.min(...boxes.map((b) => b.x))
      const x = left - DAY_PAD.left
      const y = Math.min(...boxes.map((b) => b.y)) - DAY_PAD.top
      const index = dayIndexOf(date, trip.startDate, trip.endDate)
      return [
        {
          id: `day:${date}`,
          type: 'day',
          position: { x: x + shiftAt(left), y },
          width: Math.max(...boxes.map((b) => b.r)) + DAY_PAD.right - x,
          height: Math.max(...boxes.map((b) => b.b)) + DAY_PAD.bottom - y,
          zIndex: 0,
          selectable: false,
          draggable: false,
          focusable: false,
          style: { pointerEvents: 'none' },
          data: {
            date,
            label: formatDayHeader(date),
            sub: index ? `dzień ${index}` : undefined,
            today: date === now?.date,
          },
        },
      ]
    })
  }, [days, nodes, trip.startDate, trip.endDate, branchWidth, shiftAt, now?.date])

  // Noclegi jako belki nad dniami: od dnia zameldowania do ostatniej nocy. Nakładające się noclegi
  // idą rząd wyżej i dostają czerwoną obwódkę.
  const stayNodes = useMemo((): Node[] => {
    const stays = live
      .filter(isBandStay)
      .sort((a, b) => (a.date as string).localeCompare(b.date as string))
    if (!stays.length || !dayNodes.length) return []
    const columns = dayNodes.map((n) => ({
      date: (n.data as { date: string }).date,
      x: n.position.x,
      r: n.position.x + (n.width ?? 0),
      y: n.position.y,
    }))
    const top = Math.min(...columns.map((c) => c.y))
    const rows: string[] = []
    return stays.flatMap((stay): Node[] => {
      const from = stay.date as string
      const to = stay.endDate && stay.endDate > from ? stay.endDate : addDays(from, 1)
      const covered = columns.filter((c) => c.date >= from && c.date < to)
      if (!covered.length) return []
      let row = rows.findIndex((end) => end <= from)
      if (row === -1) {
        row = rows.length
        rows.push(to)
      } else rows[row] = to
      const x = Math.min(...covered.map((c) => c.x))
      const r = Math.max(...covered.map((c) => c.r))
      return [
        {
          id: `stay:${stay.id}`,
          type: 'stay',
          position: { x, y: top - (row + 1) * (STAY_H + STAY_GAP) },
          width: r - x,
          height: STAY_H,
          zIndex: 1,
          selectable: false,
          draggable: false,
          focusable: false,
          className: now && to <= now.date ? 'is-past' : undefined,
          data: {
            card: stay,
            nights: daysBetween(from, to),
            clash: row > 0,
            cutStart: covered[0]?.date !== from,
            cutEnd: covered.at(-1)?.date !== addDays(to, -1),
          },
        },
      ]
    })
  }, [live, dayNodes, now])

  // Linia „teraz” w dzisiejszej kolumnie wg godziny: w trakcie karty ją przecina, w przerwie stoi
  // proporcjonalnie do czasu, który z przerwy minął.
  const nowNode = useMemo((): Node[] => {
    const today = now && days.find((d) => d.date === now.date)
    if (!now || !today) return []
    const byId = new Map(nodes.map((n) => [n.id, n]))
    const column = today.ids
      .flatMap((id) => {
        const n = byId.get(id)
        const card = live.find((c) => c.id === id)
        if (!n || !card?.time || card.skipped) return []
        const h = n.measured?.height ?? n.height ?? CARD_SIZE.h
        return [
          {
            time: card.time,
            durationMin: card.durationMin,
            x: n.position.x,
            top: n.position.y,
            bottom: n.position.y + h,
            n,
          },
        ]
      })
      .sort((a, b) => a.top - b.top)
    if (!column.length) return []
    const y = nowLineAt(column, now.time)
    const first = column[0] as (typeof column)[number]
    const w = first.n.measured?.width ?? first.n.width ?? CARD_SIZE.w
    return [
      {
        id: 'now',
        type: 'now',
        position: { x: first.x + shiftAt(first.x) + (insets.get(first.n.id) ?? 0), y: y - 9 },
        width: w,
        height: 18,
        zIndex: 2,
        selectable: false,
        draggable: false,
        focusable: false,
        style: { pointerEvents: 'none' },
        data: { time: now.time },
      },
    ]
  }, [now, days, nodes, live, shiftAt, insets])

  // Karty bez czasu trwania: do kiedy można zostać, żeby zdążyć na następną.
  const stays = useMemo(() => {
    const all = new Map<string, string>()
    for (const { date } of days) {
      const day = live.filter((c) => c.date === date)
      for (const [id, time] of stayTimes(day, dayGaps(day), legPlans, trip.travelBufferMin))
        all.set(id, time)
    }
    return all
  }, [days, live, legPlans, trip.travelBufferMin])

  // Kolumny dni i miejsce pod przeciąganą kartą.
  const columns = useMemo(
    () =>
      dropColumns(
        nodes.flatMap((n) => {
          const card = (n.data as { card?: CardSnapshot }).card
          // Przeciągana karta nie rozciąga swojej kolumny.
          if (!card?.date || card.id === drag.current?.card?.id) return []
          const { x, y } = n.position
          return [
            {
              id: n.id,
              date: card.date,
              left: x,
              right: x + (n.width ?? CARD_SIZE.w),
              top: y,
              bottom: y + (n.measured?.height ?? n.height ?? CARD_SIZE.h),
              time: card.time,
              durationMin: card.durationMin,
            },
          ]
        }),
        trip,
      )
        .map((column) => {
          // Upuszczanie działa na tym, co widać; `baseX` to pozycja do zapisania w dokumencie.
          const by = shiftAt(column.x)
          const cards = column.cards.map((c) => {
            const card = live.find((l) => l.id === c.id)
            const inset = by + (insets.get(c.id) ?? 0)
            return {
              ...c,
              left: c.left + inset,
              right: c.right + inset + (card ? branchWidth(card) : 0),
            }
          })
          const right = Math.max(column.x + by + column.w, ...cards.map((c) => c.right))
          return { ...column, baseX: column.x, x: column.x + by, w: right - column.x - by, cards }
        })
        .concat(newDayColumn()),
    [nodes, trip, live, shiftAt, insets, branchWidth],
  )
  /**
   * Kolumna „+ nowy dzień” za ostatnim dniem wyjazdu: upuszczenie tam wydłuża wyjazd o dzień.
   * Liczona z już policzonych kolumn, więc stoi obok ostatniej ramki.
   */
  function newDayColumn(): (DropColumn & { baseX: number; newDay?: boolean })[] {
    if (!trip.startDate) return []
    const next = addDays(trip.endDate ?? trip.startDate, 1)
    const known = dropColumns(
      nodes.flatMap((n) => {
        const card = (n.data as { card?: CardSnapshot }).card
        if (!card?.date) return []
        const { x, y } = n.position
        const w = n.width ?? CARD_SIZE.w
        return [
          { id: n.id, date: card.date, left: x, right: x + w, top: y, bottom: y + CARD_SIZE.h },
        ]
      }),
      trip,
    )
    if (!known.length || known.some((c) => c.date === next)) return []
    const baseRight = Math.max(...known.map((c) => c.x + c.w))
    const baseX = baseRight + DAY_PAD.right + DAY_SPACE + DAY_PAD.left
    return [
      { date: next, x: baseX + shiftAt(baseX), w: CARD_SIZE.w, cards: [], baseX, newDay: true },
    ]
  }
  const [drop, setDropState] = useState<Drop>(null)
  const dropRef = useRef<Drop>(null)
  const setDrop = (next: Drop) => {
    dropRef.current = next
    setDropState(next)
  }
  // Upuszczenie na dzień, który już minął (albo dziś przed „teraz”) — ostrzeżenie w podpowiedzi.
  const dropPast = Boolean(
    drop?.kind === 'day' &&
      now &&
      (drop.date < now.date || (drop.date === now.date && drop.time && drop.time < now.time)),
  )
  const dropNewDay = drop?.kind === 'day' && Boolean(trip.endDate && drop.date > trip.endDate)
  const dropNode = useMemo((): Node[] => {
    if (drop?.kind !== 'day') return []
    return [
      {
        id: 'drop',
        type: 'drop',
        position: { x: drop.x, y: drop.y - 9 },
        width: drop.w,
        height: 18,
        zIndex: 3,
        selectable: false,
        draggable: false,
        focusable: false,
        style: { pointerEvents: 'none' },
        data: {
          label: [
            dropNewDay && 'nowy dzień',
            formatShortDate(drop.date),
            drop.time,
            dropPast && 'już minęło',
          ]
            .filter(Boolean)
            .join(' · '),
          warn: dropPast,
        },
      },
    ]
  }, [drop, dropPast, dropNewDay])

  // Podczas przeciągania: miejsca „+ godzina” w kolumnach, puste dni i „+ nowy dzień”, żeby było
  // widać, gdzie karta wyląduje — także za ostatnią kartą dnia.
  const [dragCard, setDragCard] = useState<CardSnapshot | null>(null)
  const frameTop = useMemo(
    () => (dayNodes.length ? Math.min(...dayNodes.map((n) => n.position.y)) : 0),
    [dayNodes],
  )
  // Puste dni wyjazdu (np. po „dodaj dzień”) jako ramki bez kart, żeby było je widać i dało się na nie
  // upuścić kartę.
  const emptyDayNodes = useMemo(
    (): Node[] =>
      columns
        .filter((c) => !c.cards.length && !(c as { newDay?: boolean }).newDay)
        .map((c): Node => {
          const index = dayIndexOf(c.date, trip.startDate, trip.endDate)
          return {
            id: `day:${c.date}`,
            type: 'day',
            position: { x: c.x - DAY_PAD.left, y: frameTop },
            width: c.w + DAY_PAD.left + DAY_PAD.right,
            height: DAY_PAD.top + CARD_SIZE.h + DAY_PAD.bottom,
            zIndex: 0,
            selectable: false,
            draggable: false,
            focusable: false,
            className: now && c.date < now.date ? 'is-past' : undefined,
            style: { pointerEvents: 'none' },
            data: {
              date: c.date,
              label: formatDayHeader(c.date),
              sub: index ? `dzień ${index} · pusty` : 'pusty',
              today: c.date === now?.date,
            },
          }
        }),
    [columns, frameTop, trip.startDate, trip.endDate, now],
  )
  const slotNodes = useMemo((): Node[] => {
    if (!dragCard) return []
    return columns.flatMap((column): Node[] => {
      const { newDay } = column as { newDay?: boolean }
      if (!column.cards.length) {
        const label = newDay
          ? `+ nowy dzień · ${formatShortDate(column.date)}`
          : `+ ${formatShortDate(column.date)}`
        return [
          {
            id: `slot-day:${column.date}`,
            type: 'slot',
            position: { x: column.x, y: frameTop + DAY_PAD.top },
            width: column.w,
            height: CARD_SIZE.h,
            zIndex: 0,
            selectable: false,
            draggable: false,
            focusable: false,
            style: { pointerEvents: 'none' },
            data: { label, day: true, active: drop?.kind === 'day' && drop.date === column.date },
          },
        ]
      }
      return dropSlots(column, dragCard, trip.travelBufferMin).map(
        (slot, i): Node => ({
          id: `slot:${column.date}:${i}`,
          type: 'slot',
          position: { x: column.x, y: slot.y - 9 },
          width: column.w,
          height: 18,
          zIndex: 2,
          selectable: false,
          draggable: false,
          focusable: false,
          style: { pointerEvents: 'none' },
          data: { label: `+ ${slot.time ?? ''}`.trim(), day: false, active: false },
        }),
      )
    })
  }, [dragCard, columns, frameTop, trip.travelBufferMin, drop])

  const shownNodes = useMemo(
    () => [
      ...dayNodes.map((n) => {
        const { date } = n.data as { date: string }
        return now && date < now.date ? { ...n, className: 'is-past' } : n
      }),
      ...emptyDayNodes,
      ...stayNodes,
      ...slotNodes,
      ...nowNode,
      ...dropNode,
      ...nodes.flatMap((n): Node[] => {
        const grouped = group.has(n.id)
        const selected =
          grouped ||
          (selection?.kind === 'card' && selection.id === n.id) ||
          (selection?.kind === 'frame' && frameNodeId(selection.id) === n.id)
        const card = (n.data as { card?: CardSnapshot }).card
        const past = Boolean(now && card && cardIsPast(card, now, nextStart(card, live)))
        const target = drop?.kind === 'variant' && drop.id === n.id
        const by = shiftAt(n.position.x) + (insets.get(n.id) ?? 0)
        const branch = Boolean(card && branches(card))
        const stayUntil = stays.get(n.id)
        const shown =
          n.selected === selected && !past && !target && !by && !branch && !grouped && !stayUntil
            ? n
            : {
                ...n,
                selected,
                position: { x: n.position.x + by, y: n.position.y },
                className: cx(past && 'is-past', target && 'is-drop') || undefined,
                data: { ...n.data, branch, grouped, stayUntil },
              }
        if (!card || !branch) return [shown]
        const w = n.width ?? CARD_SIZE.w
        const h = n.height ?? CARD_SIZE.h
        const step = w + BRANCH_GAP
        return [
          shown,
          ...(variants.get(card.id) ?? []).map(
            (v, i): Node => ({
              id: `variant:${v.id}`,
              type: 'variant',
              position: { x: n.position.x + by + step * (i + 1), y: n.position.y },
              width: w,
              height: h,
              // Węzły powstają przy każdym rysowaniu, więc wymiary i uchwyty strzałek podajemy wprost.
              measured: { width: w, height: h },
              handles: [
                { type: 'target', position: Position.Top, x: w / 2, y: 0, width: 1, height: 1 },
                { type: 'source', position: Position.Bottom, x: w / 2, y: h, width: 1, height: 1 },
              ],
              zIndex: 1,
              selectable: false,
              draggable: false,
              focusable: false,
              data: {
                card: v,
                files: fileCounts.get(v.id) ?? 0,
                dim: Boolean(card.variantChosen),
              },
            }),
          ),
        ]
      }),
    ],
    [
      dayNodes,
      stayNodes,
      slotNodes,
      emptyDayNodes,
      nowNode,
      dropNode,
      nodes,
      selection,
      now,
      drop,
      branches,
      variants,
      group,
      shiftAt,
      insets,
      fileCounts,
      stays,
      live,
    ],
  )

  const shownEdges = useMemo(() => {
    const drawn = visibleEdges(edges, cards)
    const linked = new Set(drawn.flatMap((e) => [`${e.from}>${e.to}`, `${e.to}>${e.from}`]))
    // Opis strzałki: nakładanie się albo dojazd; kolor ostrzeżenia, gdy nie zdążycie.
    const notes = new Map<string, { warn: boolean; label?: string }>()
    for (const { date } of days) {
      for (const gap of dayGaps(live.filter((c) => c.date === date))) {
        const plan = legPlans[gap.id]
        const short = plan ? legShortfall(gap, plan, trip.travelBufferMin) : undefined
        const overlap = gap.freeMin !== undefined && gap.freeMin < 0
        // Dojazd za nami: strzałka kolejności zostaje, ale bez opisu i ostrzeżeń.
        if (now && legIsPast(gap, date, now, live)) continue
        const ride = plan
          ? `${plan.minutes} min ${TRAVEL_MODE_LABELS[plan.mode]}`
          : plan === null
            ? 'brak połączenia'
            : undefined
        notes.set(gap.id, {
          warn: overlap || (short ?? 0) > 0,
          label: overlap
            ? `nakłada się o ${-(gap.freeMin as number)} min`
            : short && short > 0
              ? `${ride} · brakuje ${short}`
              : ride,
        })
      }
    }
    // Karty na planszy: strzałka, która przecięłaby inną kartę, idzie łukiem obok kolumny.
    const boxes = nodes.flatMap((n) =>
      (n.data as { card?: CardSnapshot }).card
        ? [
            {
              id: n.id,
              x: n.position.x,
              y: n.position.y,
              w: n.measured?.width ?? n.width ?? CARD_SIZE.w,
              h: n.measured?.height ?? n.height ?? CARD_SIZE.h,
            },
          ]
        : [],
    )
    const center = (id: string) => {
      const b = boxes.find((box) => box.id === id)
      return b && { x: b.x + b.w / 2, y: b.y + b.h / 2 }
    }
    const blocked = (from: string, to: string) => {
      const a = center(from)
      const b = center(to)
      if (!a || !b) return false
      return boxes.some((r) => r.id !== from && r.id !== to && segmentHitsRect(a, b, r))
    }
    // Przed wyborem wariantu nie wiadomo, skąd i dokąd się jedzie, więc strzałka zostaje bez opisu.
    const open = (id: string) => variants.has(id) && !live.find((c) => c.id === id)?.variantChosen
    const orderEdge = (from: string, to: string, data: Record<string, unknown>) => ({
      id: `order:${from}>${to}`,
      source: from,
      target: to,
      type: 'order' as const,
      selectable: false,
      focusable: false,
      data,
    })
    // Przed wyborem każda gałąź ma strzałki do sąsiednich kart dnia.
    const forks = days.flatMap(({ ids }) =>
      ids.flatMap((id, i) => {
        const card = live.find((c) => c.id === id)
        if (!card || !branches(card) || card.variantChosen) return []
        const prev = ids[i - 1]
        const next = ids[i + 1]
        return (variants.get(id) ?? []).flatMap((v) => [
          ...(prev ? [orderEdge(prev, `variant:${v.id}`, {})] : []),
          ...(next ? [orderEdge(`variant:${v.id}`, next, {})] : []),
        ])
      }),
    )
    // Kolejność w dniu: strzałka do następnej karty, chyba że ta para ma już własną strzałkę.
    const order = days.flatMap(({ ids }) =>
      ids.slice(1).flatMap((to, i) => {
        const from = ids[i] as string
        if (linked.has(`${from}>${to}`)) return []
        const note = open(from) || open(to) ? undefined : notes.get(`${from}>${to}`)
        return [orderEdge(from, to, { ...note, around: blocked(from, to) })]
      }),
    )
    return [
      ...order,
      ...forks,
      ...drawn.map((e) => ({
        id: e.id,
        source: e.from,
        target: e.to,
        type: 'sketch' as const,
        selectable: false,
        selected: selection?.kind === 'edge' && selection.id === e.id,
        data: { label: e.label },
      })),
    ]
  }, [
    edges,
    cards,
    days,
    live,
    nodes,
    selection,
    legPlans,
    trip.travelBufferMin,
    variants,
    branches,
    now,
  ])

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((ns) => applyNodeChanges(changes, ns)),
    [],
  )

  // Pierwsze otwarcie bez zapisanego widoku: wszystko w kadrze.
  const fitted = useRef(false)
  useEffect(() => {
    if (!ready || savedViewport || fitted.current || !nodes.length) return
    fitted.current = true
    // Na telefonie cały wyjazd byłby nieczytelną miniaturą — start na dzisiejszym dniu.
    const today = now?.date ?? todayLocal()
    const day = days.find((d) => d.date === today) ?? days[0]
    requestAnimationFrame(() => {
      if (day && window.innerWidth < 640) focusDay(day.date)
      else void rf.fitView({ padding: 0.2, maxZoom: 1 })
    })
  }, [ready, savedViewport, nodes.length, rf, days])

  // Karty płynnie przechodzą na nowe miejsca (układanie, rozsuwanie dni przy wariantach).
  const animate = () => {
    setArranging(true)
    setTimeout(() => setArranging(false), 700)
  }

  // ---------- pomysły: drawer i przeciąganie na dzień ----------
  const [drawerOpen, setDrawerOpen] = useState(false)
  // Menu karty (prawy klik, przytrzymanie) w punkcie ekranu.
  const [cardMenu, setCardMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const [boardDragging, setBoardDragging] = useState(false)
  const [ghost, setGhost] = useState<{ card: CardSnapshot; x: number; y: number } | null>(null)
  const [placed, setPlaced] = useState<Placed | null>(null)
  const canvas = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let stored: string | null = null
    try {
      stored = localStorage.getItem(PANEL_KEY)
    } catch {}
    // Po udostępnieniu miejsca (`?ideas=1`) pomysły otwarte także na telefonie.
    const fromShare = new URLSearchParams(window.location.search).get('ideas') === '1'
    setDrawerOpen(fromShare || (wide && stored !== 'closed'))
  }, [wide])
  const toggleDrawer = () => {
    setDrawerOpen(!drawerOpen)
    if (!wide) return
    try {
      localStorage.setItem(PANEL_KEY, drawerOpen ? 'closed' : 'open')
    } catch {}
  }

  const overIdeas = ({ x, y }: { x: number; y: number }) =>
    [...document.querySelectorAll('[data-ideas-drop]')].some((el) => {
      const r = el.getBoundingClientRect()
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom
    })
  const targetAt = (screen: { x: number; y: number }, card: CardSnapshot): Drop =>
    overIdeas(screen)
      ? { kind: 'ideas' }
      : dropTarget(rf.screenToFlowPosition(screen), columns, card, trip.travelBufferMin)

  const router = useRouter()
  const [pendingVariant, setPendingVariant] = useState<{
    card: CardSnapshot
    targetId: string
    undo: () => void
  } | null>(null)
  const [addingDay, setAddingDay] = useState(false)
  /** Zapisuje upuszczenie: pomysł, wariant albo miejsce w dniu, z godziną do poprawienia. */
  const place = (card: CardSnapshot, target: NonNullable<Drop>) => {
    const { date, endDate, time, x, y } = card
    const undoPlace = () => {
      detachVariant(doc, card.id)
      updateCard(doc, card.id, { date, endDate, time })
      moveItems(doc, { cards: { [card.id]: { x, y } } })
    }
    if (target.kind === 'ideas') {
      moveCardToDay(doc, card.id, undefined)
      offerUndo('karta w pomysłach', undoPlace)
    } else if (target.kind === 'variant') {
      // Wariant tylko po potwierdzeniu: upuszczenie na kartę łatwo zrobić przez przypadek.
      setPendingVariant({ card, targetId: target.id, undo: undoPlace })
    } else {
      // Upuszczenie za ostatnim dniem wydłuża wyjazd o ten dzień.
      if (trip.endDate && target.date > trip.endDate)
        void extendTrip(trip.id, target.date).then((ok) => ok && router.refresh())
      moveCardToDay(doc, card.id, target.date)
      updateCard(doc, card.id, { time: target.time })
      if (target.empty) {
        const baseX = columns.find((c) => c.date === target.date)?.baseX ?? target.x
        moveItems(doc, { cards: { [card.id]: { x: baseX, y: snapToGrid(target.y) } } })
      }
      setPlaced({ id: card.id, date: target.date, time: target.time ?? '', undo: undoPlace })
    }
  }

  const edgePan = useRef<ReturnType<typeof setInterval> | null>(null)
  const ideaMove = useRef<() => void>(() => {})
  const ideaDrag: IdeaDrag = {
    start: (card, x, y) => {
      setGhost({ card, x, y })
      setDragCard(card)
      setPlaced(null)
      if (!wide) setDrawerOpen(false)
      edgePan.current = setInterval(() => ideaMove.current(), 16)
    },
    move: (card, x, y) => {
      setGhost({ card, x, y })
      const target = targetAt({ x, y }, card)
      setDrop(target?.kind === 'ideas' ? null : target)
      ideaMove.current = () => {
        const r = canvas.current?.getBoundingClientRect()
        // Nad panelem pomysłów tablica stoi: dopiero po wejściu na nią krawędź ją przesuwa.
        if (!r || x > r.right) return
        const dx = x < r.left + EDGE_PX ? EDGE_STEP : x > r.right - EDGE_PX ? -EDGE_STEP : 0
        const dy = y < r.top + EDGE_PX ? EDGE_STEP : y > r.bottom - EDGE_PX ? -EDGE_STEP : 0
        if (dx || dy) api.panBy(dx, dy)
      }
    },
    end: (card) => {
      if (edgePan.current) clearInterval(edgePan.current)
      ideaMove.current = () => {}
      const target = dropRef.current
      setDrop(null)
      setGhost(null)
      setDragCard(null)
      if (target) place(card, target)
    },
  }

  const nodesRef = useRef(nodes)
  nodesRef.current = nodes

  const api: BoardApi = {
    select: (sel) => {
      setMenu(null)
      setGroup(new Set())
      setSelection(sel)
    },
    toggleGroup: (id) => {
      setMenu(null)
      const next = new Set(group)
      if (selection?.kind === 'card') next.add(selection.id)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      setSelection(null)
      setGroup(next)
    },
    openCard: (id) => sheet.open(id),
    panBy: (dx, dy) => {
      const { x, y, zoom } = rf.getViewport()
      void rf.setViewport({ x: x + dx, y: y + dy, zoom })
    },
    dragStart: (kind, id) => {
      setMenu(null)
      setCardMenu(null)
      const many = kind === 'card' && group.size > 1 && group.has(id)
      if (!many) {
        setGroup(new Set())
        setSelection({ kind, id })
      }
      const ids = many
        ? [...group]
        : kind === 'card'
          ? [id]
          : [frameNodeId(id), ...live.filter((c) => c.frameId === id).map((c) => c.id)]
      const start = new Map<string, { x: number; y: number }>()
      for (const n of nodesRef.current) if (ids.includes(n.id)) start.set(n.id, { ...n.position })
      // Grupa tylko się przesuwa; upuszczanie na dzień i na kartę dotyczy pojedynczej karty.
      const card = kind === 'card' && !many ? live.find((c) => c.id === id) : undefined
      drag.current = { start, dx: 0, dy: 0, lead: kind === 'card' ? id : frameNodeId(id), card }
      setBoardDragging(Boolean(card))
      setDragCard(card ?? null)
    },
    dragMove: (dx, dy) => {
      const d = drag.current
      if (!d) return
      const zoom = rf.getZoom()
      const lead = d.start.get(d.lead)
      if (!lead) return
      d.dx = snapToGrid(lead.x + dx / zoom) - lead.x
      d.dy = snapToGrid(lead.y + dy / zoom) - lead.y
      setNodes((ns) =>
        ns.map((n) => {
          const s = d.start.get(n.id)
          return s ? { ...n, position: { x: s.x + d.dx, y: s.y + d.dy } } : n
        }),
      )
      const s = d.card && d.start.get(d.card.id)
      if (!d.card || !s) return
      const center = {
        x: s.x + d.dx + (d.card.w ?? CARD_SIZE.w) / 2,
        y: s.y + d.dy + (d.card.h ?? CARD_SIZE.h) / 2,
      }
      center.x += shiftAt(s.x + d.dx) + (insets.get(d.card.id) ?? 0)
      const target = targetAt(rf.flowToScreenPosition(center), d.card)
      // W swoim dniu karta porusza się swobodnie.
      setDrop(target?.kind === 'day' && target.date === d.card.date ? null : target)
    },
    dragEnd: () => {
      const d = drag.current
      drag.current = null
      const target = dropRef.current
      setDrop(null)
      setBoardDragging(false)
      setDragCard(null)
      if (!d || (!d.dx && !d.dy)) return
      if (d.card && target) {
        setUndo(null)
        place(d.card, target)
        return
      }
      const moves: { cards: Positions; frames: Positions } = { cards: {}, frames: {} }
      for (const [id, s] of d.start) {
        const p = { x: s.x + d.dx, y: s.y + d.dy }
        if (id.startsWith('frame:')) moves.frames[id.slice(6)] = p
        else moves.cards[id] = p
      }
      setUndo(null)
      moveItems(doc, moves)
    },
    chooseVariant: (id) => {
      animate()
      chooseVariant(doc, id)
    },
    togglePin: (id) => {
      const card = live.find((c) => c.id === id)
      if (card) updateCard(doc, id, { pinned: !card.pinned })
    },
    trash: (id) => {
      setSelection(null)
      withUndo(doc, 'karta w koszu', () => trashCard(doc, id))
    },
    openMenu: (id, x, y) => {
      setSelection({ kind: 'card', id })
      setCardMenu({ id, x, y })
    },
    renameFrame: (id) => {
      const current = framesOf(doc).get(id)?.get('title') as string | undefined
      void askText({ title: 'nazwa ramki', value: current ?? '' }).then(
        (title) => title && renameFrame(doc, id, title),
      )
    },
    deleteFrame: (id) => {
      setSelection(null)
      withUndo(doc, 'ramka usunięta', () => deleteFrame(doc, id))
    },
    resizeFrame: (id, { x, y, w, h }) =>
      resizeFrame(doc, id, {
        x: snapToGrid(x),
        y: snapToGrid(y),
        w: snapToGrid(w),
        h: snapToGrid(h),
      }),
    labelEdge: (id) => {
      const current = edgesOf(doc).get(id)?.get('label') as string | undefined
      void askText({
        title: 'etykieta strzałki',
        placeholder: 'np. pociąg 2 h',
        value: current ?? '',
        allowEmpty: true,
      }).then((label) => label !== null && setEdgeLabel(doc, id, label))
    },
    deleteEdge: (id) => {
      setSelection(null)
      withUndo(doc, 'strzałka usunięta', () => deleteEdge(doc, id))
    },
  }

  // ---------- kursor dla drugiej osoby (awareness, co najwyżej co 50 ms) ----------
  const lastShare = useRef(0)
  const sharePointer = (x: number | null, y?: number) => {
    const awareness = provider?.awareness
    if (!awareness) return
    if (x === null || y === undefined) {
      awareness.setLocalStateField('pointer', null)
      return
    }
    const now = performance.now()
    if (now - lastShare.current < 50) return
    lastShare.current = now
    awareness.setLocalStateField('pointer', rf.screenToFlowPosition({ x, y }))
  }

  // ---------- menu przytrzymania tła ----------
  const hold = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number } | null>(null)
  const pointers = useRef(0)
  const cancelHold = () => {
    if (hold.current) clearTimeout(hold.current.timer)
    hold.current = null
  }
  const openMenu = (x: number, y: number) => {
    setSelection(null)
    setMenu({ x, y, flow: rf.screenToFlowPosition({ x, y }) })
  }

  // Lewy górny róg karty tak, żeby jej środek wypadł w punkcie.
  const centered = (at: { x: number; y: number }) => ({
    x: snapToGrid(at.x - CARD_SIZE.w / 2),
    y: snapToGrid(at.y - CARD_SIZE.h / 2),
  })
  const addCard = (at: { x: number; y: number }) => {
    const id = createCard(doc, { type: 'note', ...centered(at) })
    setMenu(null)
    sheet.open(id, true)
  }
  const viewportCenter = () =>
    rf.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 })

  const menuItems = menu && [
    { label: 'nowa karta', icon: SquarePlus, run: () => addCard(menu.flow) },
    {
      label: 'ramka',
      icon: SquareDashed,
      run: () => {
        const id = createFrame(doc, { x: snapToGrid(menu.flow.x), y: snapToGrid(menu.flow.y) })
        setMenu(null)
        setSelection({ kind: 'frame', id })
      },
    },
    {
      label: 'wklej link',
      icon: ClipboardPaste,
      run: async () => {
        const id = await pasteAsCard(doc, centered(menu.flow))
        setMenu(null)
        if (id) setSelection({ kind: 'card', id })
      },
    },
    ...(trip.startDate
      ? [
          {
            label: 'dodaj dzień',
            icon: CalendarPlus,
            run: () => {
              setMenu(null)
              setAddingDay(true)
            },
          },
        ]
      : []),
  ]

  // Strzałki w rogu: kadr przeskakuje na poprzedni lub następny dzień.
  const [focused, setFocused] = useState<string | null>(null)
  const jump = (step: number) => {
    const today = now?.date ?? todayLocal()
    const current = focused && days.some((d) => d.date === focused) ? focused : undefined
    const start = current
      ? days.findIndex((d) => d.date === current)
      : days.findIndex((d) => d.date >= today)
    const index = current ? start + step : start === -1 ? days.length - 1 : start
    const day = days[Math.min(days.length - 1, Math.max(0, index))]
    if (!day) return
    setFocused(day.date)
    focusDay(day.date, 350)
  }

  /**
   * Kadr na dzień: cały, jeśli mieści się czytelnie; inaczej szerokość dnia, a w pionie okolice
   * „teraz” (dziś) albo początek dnia.
   */
  const focusDay = (date: string, duration = 0) => {
    const node = rf.getNode(`day:${date}`)
    const box = canvas.current?.getBoundingClientRect()
    if (!node?.width || !node.height || !box) return
    const width = box.width - FOCUS.side * 2
    const height = box.height - FOCUS.top - FOCUS.bottom
    const across = Math.min(width / node.width, 1)
    const whole = Math.min(across, height / node.height)
    const fits = whole >= FOCUS.readableZoom
    const zoom = fits ? whole : Math.max(across, FOCUS.readableZoom)
    const x = box.width / 2 - (node.position.x + node.width / 2) * zoom
    const nowY = date === now?.date ? nowNode[0]?.position.y : undefined
    const y = fits
      ? FOCUS.top + (height - node.height * zoom) / 2 - node.position.y * zoom
      : nowY !== undefined
        ? FOCUS.top + height * FOCUS.nowAt - nowY * zoom
        : FOCUS.top - node.position.y * zoom
    void rf.setViewport({ x, y, zoom }, { duration })
  }

  const arrange = () => {
    setSelection(null)
    animate()
    setUndo(arrangeByDays(doc, cards, trip))
    requestAnimationFrame(() => rf.fitView({ padding: 0.2, maxZoom: 1, duration: 200 }))
  }

  return (
    <BoardContext.Provider value={api}>
      {days.map(({ date }) => (
        <DayPlans key={date} date={date} onPlans={addPlans} />
      ))}
      <div
        ref={canvas}
        inert={!!sheet.openId && !wide}
        className="fixed inset-0"
        style={
          wide && (sheet.openId || drawerOpen)
            ? { right: sheet.openId ? CARD_PANEL_WIDTH : PANEL_WIDTH }
            : undefined
        }
        onPointerDown={(e) => {
          pointers.current++
          cancelHold()
          if (pointers.current > 1 || e.pointerType === 'mouse') return
          const target = e.target as HTMLElement
          // Menu tła tylko na pustym miejscu — karta ma własne menu (przytrzymanie) i nie leży „pod” tłem.
          if (!target.closest('.react-flow__pane') || target.closest('.react-flow__node')) return
          const { clientX: x, clientY: y } = e
          hold.current = { x, y, timer: setTimeout(() => openMenu(x, y), HOLD_MENU_MS) }
        }}
        onPointerMove={(e) => {
          sharePointer(e.clientX, e.clientY)
          if (
            hold.current &&
            Math.hypot(e.clientX - hold.current.x, e.clientY - hold.current.y) > 8
          )
            cancelHold()
        }}
        onPointerLeave={() => sharePointer(null)}
        onPointerUp={() => {
          pointers.current = Math.max(0, pointers.current - 1)
          cancelHold()
        }}
        onPointerCancel={() => {
          pointers.current = Math.max(0, pointers.current - 1)
          cancelHold()
        }}
      >
        <ReactFlow
          nodes={shownNodes}
          edges={shownEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgeClick={(_, e) => api.select({ kind: 'edge', id: e.id })}
          onPaneClick={() => api.select(null)}
          onPaneContextMenu={(e) => {
            e.preventDefault()
            openMenu(e.clientX, e.clientY)
          }}
          onMoveStart={() => setMenu(null)}
          onMoveEnd={(_, viewport) => {
            try {
              localStorage.setItem(`planer-viewport-${trip.id}`, JSON.stringify(viewport))
            } catch {}
          }}
          defaultViewport={savedViewport ?? { x: 16, y: 120, zoom: 0.8 }}
          minZoom={0.15}
          maxZoom={2}
          zoomOnDoubleClick={false}
          elevateNodesOnSelect={false}
          nodesDraggable={false}
          selectionKeyCode={null}
          multiSelectionKeyCode={null}
          proOptions={{ hideAttribution: true }}
          className={cx('planer-board', arranging && 'is-arranging')}
        >
          <Background variant={BackgroundVariant.Dots} gap={GRID} size={1.4} />
        </ReactFlow>

        <div className="pointer-events-none absolute inset-x-px top-1 z-(--z-overlay) [&>*]:pointer-events-auto">
          <TopBar
            title={<TripTitle />}
            back={TRIPS_BACK}
            morph={`trip-${trip.id}`}
            menu={<TripMenu />}
            actions={
              <>
                <ChatButton onOpenCard={(id) => sheet.open(id)} />
                <TripStatus />
                {undo && (
                  <button
                    type="button"
                    onClick={() => {
                      restorePositions(doc, undo)
                      setUndo(null)
                    }}
                    className="island flex h-11 shrink-0 items-center gap-1 px-3 text-sm text-accent"
                  >
                    <Undo2 className="size-4" aria-hidden="true" /> cofnij
                  </button>
                )}
              </>
            }
            more={
              <>
                <button
                  type="button"
                  onClick={arrange}
                  aria-label="ułóż karty wg dni"
                  title="ułóż wg dni"
                  className="island flex size-11 shrink-0 items-center justify-center text-muted hover:text-accent"
                >
                  <Columns3 className="size-5" aria-hidden="true" />
                </button>
              </>
            }
          />
        </div>

        {days.length > 0 && (
          <div
            className="island absolute right-1 z-(--z-overlay) flex items-center"
            style={{ bottom: controlsBottom(wide) }}
          >
            <button
              type="button"
              onClick={() => jump(-1)}
              aria-label="poprzedni dzień"
              className="flex size-11 items-center justify-center text-muted hover:text-accent"
            >
              <ChevronLeft className="size-5" aria-hidden="true" />
            </button>
            <span className="px-1 text-xs whitespace-nowrap text-subtle">
              {focused ? formatShortDate(focused) : 'dni'}
            </span>
            <button
              type="button"
              onClick={() => jump(1)}
              aria-label="następny dzień"
              className="flex size-11 items-center justify-center text-muted hover:text-accent"
            >
              <ChevronRight className="size-5" aria-hidden="true" />
            </button>
          </div>
        )}

        <IdeasDrawer
          ideas={ideas}
          variants={variants}
          open={drawerOpen}
          wide={wide}
          dragging={boardDragging}
          drag={ideaDrag}
          onToggle={toggleDrawer}
          onOpenCard={(id) => sheet.open(id)}
        />

        {placed && (
          <div
            className="island absolute left-1 z-(--z-overlay) flex items-center gap-1 pl-3 text-sm"
            style={{ bottom: `calc(${controlsBottom(wide)} + 52px)` }}
          >
            <span className="text-subtle">{formatShortDate(placed.date)}</span>
            <input
              type="time"
              aria-label="godzina karty"
              value={placed.time}
              onChange={(e) => {
                setPlaced({ ...placed, time: e.target.value })
                updateCard(doc, placed.id, { time: e.target.value })
              }}
              className="h-11 bg-transparent px-1 text-text"
            />
            <button
              type="button"
              onClick={() => {
                placed.undo()
                setPlaced(null)
              }}
              className="min-h-11 px-2 text-xs text-muted"
            >
              cofnij
            </button>
            <button
              type="button"
              onClick={() => setPlaced(null)}
              className="min-h-11 px-3 text-xs font-bold text-accent"
            >
              gotowe
            </button>
          </div>
        )}

        {ghost && (
          <div
            className="island pointer-events-none fixed z-(--z-dialog) max-w-48 -translate-x-1/2 -translate-y-1/2 truncate border-accent px-3 py-2 text-sm font-bold"
            style={{ left: ghost.x, top: ghost.y }}
          >
            {ghost.card.title || 'bez tytułu'}
          </div>
        )}

        {dragCard && (
          <div
            role="status"
            className={cx(
              'island pointer-events-none fixed top-16 left-1/2 z-(--z-dialog) -translate-x-1/2 px-3 py-2 text-sm whitespace-nowrap',
              dropPast ? 'border-red text-red' : drop ? 'border-accent text-accent' : 'text-muted',
            )}
          >
            {drop?.kind === 'day'
              ? [
                  dropNewDay ? '+ nowy dzień' : '→',
                  formatShortDate(drop.date),
                  drop.time,
                  dropPast && '· już minęło',
                ]
                  .filter(Boolean)
                  .join(' ')
              : drop?.kind === 'variant'
                ? `wariant karty „${live.find((c) => c.id === drop.id)?.title || 'bez tytułu'}”`
                : drop?.kind === 'ideas'
                  ? 'do pomysłów'
                  : 'luzem na Tablicy'}
          </div>
        )}

        <SessionBanner />
        <RemotePointers />
        <ImportRunner />
        <ImportStatus />
        <DraftReview onEdit={(id) => sheet.open(id)} />

        {ready && !live.length && !frames.length && (
          <p className="pointer-events-none absolute inset-x-4 top-1/3 text-center text-sm text-subtle italic">
            pusta tablica · przytrzymaj tło albo dotknij +
          </p>
        )}

        {menu && menuItems && (
          <div
            ref={menuRef}
            role="menu"
            className="island fade-in absolute z-(--z-popover) flex min-w-48 flex-col p-1"
            // Cały na ekranie: szerokość min-w-48, wysokość z liczby pozycji (44 px + ramka).
            style={{
              left: Math.min(menu.x, window.innerWidth - 192 - 8),
              top: Math.min(menu.y, window.innerHeight - menuItems.length * 44 - 16),
            }}
          >
            {menuItems.map(({ label, icon: Icon, run }) => (
              <button
                key={label}
                type="button"
                role="menuitem"
                onClick={run}
                className="flex min-h-11 items-center gap-2 rounded-inner px-3 text-left text-sm hover:bg-raised"
              >
                <Icon className="size-4 text-muted" aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
        )}

        <AddButton
          onNew={() => addCard(viewportCenter())}
          templates={templates}
          onImport={(files) =>
            void enqueueImport(trip.id, files).then(() => runImports(trip.id, doc))
          }
          onTemplate={(t) =>
            sheet.open(createFromTemplate(doc, t, centered(viewportCenter())), true)
          }
          onPaste={async () => {
            const id = await pasteAsCard(doc, centered(viewportCenter()))
            if (id) setSelection({ kind: 'card', id })
          }}
        />
      </div>

      {cardMenu &&
        (() => {
          const card = live.find((c) => c.id === cardMenu.id)
          if (!card) return null
          // Dni wyjazdu, a bez dat — dni, które już mają karty.
          const menuDays = trip.startDate
            ? dateRange(trip.startDate, trip.endDate ?? trip.startDate)
            : days.map((d) => d.date)
          return (
            <CardMenu
              card={card}
              at={{ x: cardMenu.x, y: cardMenu.y }}
              days={menuDays}
              wide={wide}
              onClose={() => setCardMenu(null)}
              actions={{
                togglePin: () => updateCard(doc, card.id, { pinned: !card.pinned }),
                moveToDay: (date) => {
                  animate()
                  moveCardToDay(doc, card.id, date)
                },
                toIdeas: () => {
                  setSelection(null)
                  withUndo(doc, 'karta w pomysłach', () => moveToIdeas(doc, card.id))
                },
                toggleSkip: () =>
                  withUndo(doc, card.skipped ? 'karta wróciła do planu' : 'karta pominięta', () =>
                    updateCard(doc, card.id, { skipped: !card.skipped || undefined }),
                  ),
                trash: () => api.trash(card.id),
              }}
            />
          )
        })()}

      {pendingVariant &&
        (() => {
          const { card, targetId, undo } = pendingVariant
          const target = live.find((c) => c.id === targetId)
          const close = () => setPendingVariant(null)
          const cancel = () => {
            // Karta przeciągana po Tablicy wraca na swoje miejsce.
            moveItems(doc, { cards: { [card.id]: { x: card.x, y: card.y } } })
            close()
          }
          const besideTime =
            target?.time &&
            roundClock(shiftClock(target.time, (target.durationMin ?? 60) + trip.travelBufferMin))
          return (
            <DialogFrame title="zrobić wariant?" onCancel={cancel}>
              <p className="text-sm text-muted">
                „{card.title || 'bez tytułu'}” jako wariant karty „{target?.title || 'bez tytułu'}”
                — jedna z nich trafi do planu, druga zostanie w zapasie.
              </p>
              <div className="mt-1 flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => {
                    animate()
                    addVariant(doc, card.id, targetId)
                    offerUndo('dodano wariant', undo)
                    close()
                  }}
                  className={buttonClass('primary')}
                >
                  zrób wariant
                </button>
                {target?.date && (
                  <button
                    type="button"
                    onClick={() => {
                      moveCardToDay(doc, card.id, target.date)
                      updateCard(doc, card.id, { time: besideTime || undefined })
                      setPlaced({
                        id: card.id,
                        date: target.date as string,
                        time: besideTime ?? '',
                        undo,
                      })
                      close()
                    }}
                    className={buttonClass('island', 'border-accent text-accent')}
                  >
                    wstaw za nią{besideTime ? ` · ${besideTime}` : ''}
                  </button>
                )}
                <button type="button" onClick={cancel} className={buttonClass('island')}>
                  anuluj
                </button>
              </div>
            </DialogFrame>
          )
        })()}

      {addingDay && trip.startDate && (
        <ConfirmDialog
          title="dodać dzień?"
          body={`Wyjazd wydłuży się do ${formatDayHeader(addDays(trip.endDate ?? trip.startDate, 1))}. Pusty dzień pojawi się na Tablicy obok ostatniego.`}
          confirm="dodaj dzień"
          onConfirm={() => {
            setAddingDay(false)
            void extendTrip(trip.id, addDays(trip.endDate ?? (trip.startDate as string), 1)).then(
              (ok) => ok && router.refresh(),
            )
          }}
          onCancel={() => setAddingDay(false)}
        />
      )}

      {sheet.openId && (
        <CardSheet cardId={sheet.openId} isNew={sheet.isNew} onClose={sheet.close} />
      )}
    </BoardContext.Provider>
  )
}

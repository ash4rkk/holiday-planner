'use client'

import '@xyflow/react/dist/base.css'
import {
  arrangeByDays,
  CARD_SIZE,
  type CardSnapshot,
  cardIsPast,
  createCard,
  createEdge,
  createFrame,
  dayGaps,
  dayIndexOf,
  dayOrder,
  deleteEdge,
  deleteFrame,
  edgesOf,
  formatDayHeader,
  formatShortDate,
  framesOf,
  type LegPlan,
  legShortfall,
  moveItems,
  type Positions,
  renameFrame,
  resizeFrame,
  restoreCard,
  restorePositions,
  setEdgeLabel,
  TRAVEL_MODE_LABELS,
  todayLocal,
  trashCard,
  updateCard,
  visibleEdges,
} from '@planer/core'
import {
  applyNodeChanges,
  Background,
  BackgroundVariant,
  type Node,
  type NodeChange,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Viewport,
} from '@xyflow/react'
import { ChevronLeft, ChevronRight, Columns3, Plus, Undo2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AddButton } from '@/components/add-button'
import { ChatButton } from '@/components/ai/chat-panel'
import { DraftReview, ImportRunner, ImportStatus } from '@/components/ai/import-ui'
import { CardSheet } from '@/components/card/card-sheet'
import { InboxButton } from '@/components/inbox/inbox-button'
import { TopBar, TRIPS_BACK } from '@/components/top-bar'
import { SessionBanner, TripStatus } from '@/components/trip-status'
import { cx } from '@/components/ui'
import { enqueueImport, runImports } from '@/lib/ai-import'
import { countByCard } from '@/lib/attachment-counts'
import { createFromTemplate } from '@/lib/card-templates'
import { pasteAsCard } from '@/lib/place-card'
import { offerUndo } from '@/lib/undo'
import { useCardSheet } from '@/lib/use-card-sheet'
import { useDayPlans } from '@/lib/use-day-plans'
import { useTripNow } from '@/lib/use-trip-now'
import { useAttachments, useCards, useEdges, useFrames, useTrip } from '@/lib/yjs/trip-doc'
import { type BoardApi, BoardContext, frameNodeId, type Selection } from './board-context'
import { CardNode } from './card-node'
import { DayNode } from './day-node'
import { FrameNode } from './frame-node'
import { NowNode } from './now-node'
import { RemotePointers } from './remote-pointers'
import { OrderEdge, SketchEdge } from './sketch-edge'

const nodeTypes = { card: CardNode, frame: FrameNode, day: DayNode, now: NowNode }
const edgeTypes = { sketch: SketchEdge, order: OrderEdge }
// Margines obrysu dnia wokół kart; u góry miejsce na etykietę dnia.
const DAY_PAD = { side: 22, top: 34, bottom: 22 }
const HOLD_MENU_MS = 500

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
  const [nodes, setNodes] = useState<Node[]>([])
  const [menu, setMenu] = useState<{ x: number; y: number; flow: { x: number; y: number } } | null>(
    null,
  )
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
  } | null>(null)

  const live = useMemo(() => cards.filter((c) => !c.deletedAt), [cards])
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
        ...live.map(
          (c): Node => ({
            id: c.id,
            type: 'card',
            position: { x: c.x, y: c.y },
            width: c.w ?? CARD_SIZE.w,
            height: c.h ?? CARD_SIZE.h,
            zIndex: 1,
            selectable: false,
            draggable: false,
            data: { card: c, files: fileCounts.get(c.id) ?? 0 },
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
  }, [live, frames, fileCounts])

  const days = useMemo(() => dayOrder(live), [live])
  const now = useTripNow()

  // Obrysy dni z bieżących pozycji węzłów (także w trakcie przeciągania).
  const dayNodes = useMemo(() => {
    const byId = new Map(nodes.map((n) => [n.id, n]))
    return days.flatMap(({ date, ids }): Node[] => {
      const boxes = ids.flatMap((id) => {
        const n = byId.get(id)
        if (!n) return []
        const w = n.measured?.width ?? n.width ?? CARD_SIZE.w
        const h = n.measured?.height ?? n.height ?? CARD_SIZE.h
        return [{ x: n.position.x, y: n.position.y, r: n.position.x + w, b: n.position.y + h }]
      })
      if (!boxes.length) return []
      const x = Math.min(...boxes.map((b) => b.x)) - DAY_PAD.side
      const y = Math.min(...boxes.map((b) => b.y)) - DAY_PAD.top
      const index = dayIndexOf(date, trip.startDate, trip.endDate)
      return [
        {
          id: `day:${date}`,
          type: 'day',
          position: { x, y },
          width: Math.max(...boxes.map((b) => b.r)) + DAY_PAD.side - x,
          height: Math.max(...boxes.map((b) => b.b)) + DAY_PAD.bottom - y,
          zIndex: 0,
          selectable: false,
          draggable: false,
          focusable: false,
          style: { pointerEvents: 'none' },
          data: { date, label: formatDayHeader(date), sub: index ? `dzień ${index}` : undefined },
        },
      ]
    })
  }, [days, nodes, trip.startDate, trip.endDate])

  // Linia „teraz” w dzisiejszej kolumnie: w przerwie między ostatnią rozpoczętą a następną kartą.
  const nowNode = useMemo((): Node[] => {
    const today = now && days.find((d) => d.date === now.date)
    if (!now || !today) return []
    const byId = new Map(nodes.map((n) => [n.id, n]))
    const column = today.ids.flatMap((id) => {
      const n = byId.get(id)
      const card = live.find((c) => c.id === id)
      if (!n || !card?.time) return []
      const h = n.measured?.height ?? n.height ?? CARD_SIZE.h
      return [{ time: card.time, x: n.position.x, top: n.position.y, bottom: n.position.y + h, n }]
    })
    if (!column.length) return []
    const next = column.findIndex((c) => c.time > now.time)
    const before = column[(next === -1 ? column.length : next) - 1]
    const after = next === -1 ? undefined : column[next]
    const y =
      before && after
        ? (before.bottom + after.top) / 2
        : after
          ? after.top - 16
          : (before?.bottom ?? 0) + 16
    const first = (after ?? before) as (typeof column)[number]
    const w = first.n.measured?.width ?? first.n.width ?? CARD_SIZE.w
    return [
      {
        id: 'now',
        type: 'now',
        position: { x: first.x, y: y - 9 },
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
  }, [now, days, nodes, live])

  const shownNodes = useMemo(
    () => [
      ...dayNodes.map((n) => {
        const { date } = n.data as { date: string }
        return now && date < now.date ? { ...n, className: 'is-past' } : n
      }),
      ...nowNode,
      ...nodes.map((n) => {
        const selected =
          (selection?.kind === 'card' && selection.id === n.id) ||
          (selection?.kind === 'frame' && frameNodeId(selection.id) === n.id)
        const card = (n.data as { card?: CardSnapshot }).card
        const past = Boolean(now && card && cardIsPast(card, now))
        if (n.selected === selected && past === (n.className === 'is-past')) return n
        return { ...n, selected, className: past ? 'is-past' : undefined }
      }),
    ],
    [dayNodes, nowNode, nodes, selection, now],
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
        const ride = plan ? `${plan.minutes} min ${TRAVEL_MODE_LABELS[plan.mode]}` : undefined
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
    // Kolejność w dniu: strzałka do następnej karty, chyba że ta para ma już własną strzałkę.
    const order = days.flatMap(({ ids }) =>
      ids.slice(1).flatMap((to, i) => {
        const from = ids[i] as string
        if (linked.has(`${from}>${to}`)) return []
        return [
          {
            id: `order:${from}>${to}`,
            source: from,
            target: to,
            type: 'order' as const,
            selectable: false,
            focusable: false,
            data: notes.get(`${from}>${to}`) ?? {},
          },
        ]
      }),
    )
    return [
      ...order,
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
  }, [edges, cards, days, live, selection, legPlans, trip.travelBufferMin])

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
    const today = todayLocal()
    const day = days.find((d) => d.date === today) ?? days[0]
    const focus = window.innerWidth < 640 ? day?.ids.map((id) => ({ id })) : undefined
    requestAnimationFrame(() =>
      rf.fitView({ padding: focus ? 0.1 : 0.2, maxZoom: 1, nodes: focus }),
    )
  }, [ready, savedViewport, nodes.length, rf, days])

  const nodesRef = useRef(nodes)
  nodesRef.current = nodes

  const api: BoardApi = {
    select: (sel) => {
      setMenu(null)
      setSelection(sel)
    },
    openCard: (id) => sheet.open(id),
    panBy: (dx, dy) => {
      const { x, y, zoom } = rf.getViewport()
      void rf.setViewport({ x: x + dx, y: y + dy, zoom })
    },
    dragStart: (kind, id) => {
      setMenu(null)
      setSelection({ kind, id })
      const ids =
        kind === 'card'
          ? [id]
          : [frameNodeId(id), ...live.filter((c) => c.frameId === id).map((c) => c.id)]
      const start = new Map<string, { x: number; y: number }>()
      for (const n of nodesRef.current) if (ids.includes(n.id)) start.set(n.id, { ...n.position })
      drag.current = { start, dx: 0, dy: 0 }
    },
    dragMove: (dx, dy) => {
      const d = drag.current
      if (!d) return
      const zoom = rf.getZoom()
      d.dx = dx / zoom
      d.dy = dy / zoom
      setNodes((ns) =>
        ns.map((n) => {
          const s = d.start.get(n.id)
          return s ? { ...n, position: { x: s.x + d.dx, y: s.y + d.dy } } : n
        }),
      )
    },
    dragEnd: () => {
      const d = drag.current
      drag.current = null
      if (!d || (!d.dx && !d.dy)) return
      const moves: { cards: Positions; frames: Positions } = { cards: {}, frames: {} }
      for (const [id, s] of d.start) {
        const p = { x: s.x + d.dx, y: s.y + d.dy }
        if (id.startsWith('frame:')) moves.frames[id.slice(6)] = p
        else moves.cards[id] = p
      }
      setUndo(null)
      moveItems(doc, moves)
    },
    togglePin: (id) => {
      const card = live.find((c) => c.id === id)
      if (card) updateCard(doc, id, { pinned: !card.pinned })
    },
    trash: (id) => {
      setSelection(null)
      trashCard(doc, id)
      offerUndo('karta w koszu', () => restoreCard(doc, id))
    },
    renameFrame: (id) => {
      const current = framesOf(doc).get(id)?.get('title') as string | undefined
      const title = window.prompt('nazwa ramki', current ?? '')?.trim()
      if (title) renameFrame(doc, id, title)
    },
    deleteFrame: (id) => {
      setSelection(null)
      deleteFrame(doc, id)
    },
    resizeFrame: (id, rect) => resizeFrame(doc, id, rect),
    labelEdge: (id) => {
      const current = edgesOf(doc).get(id)?.get('label') as string | undefined
      const label = window.prompt('etykieta strzałki, np. „pociąg 2 h”', current ?? '')
      if (label !== null && label !== undefined) setEdgeLabel(doc, id, label)
    },
    deleteEdge: (id) => {
      setSelection(null)
      deleteEdge(doc, id)
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
    x: Math.round(at.x - CARD_SIZE.w / 2),
    y: Math.round(at.y - CARD_SIZE.h / 2),
  })
  const addCard = (at: { x: number; y: number }) => {
    const id = createCard(doc, { type: 'note', ...centered(at) })
    setMenu(null)
    sheet.open(id, true)
  }
  const viewportCenter = () =>
    rf.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 })

  const menuItems = menu && [
    { label: 'nowa karta', run: () => addCard(menu.flow) },
    {
      label: 'ramka',
      run: () => {
        const id = createFrame(doc, { x: Math.round(menu.flow.x), y: Math.round(menu.flow.y) })
        setMenu(null)
        setSelection({ kind: 'frame', id })
      },
    },
    {
      label: 'wklej',
      run: async () => {
        const id = await pasteAsCard(doc, centered(menu.flow))
        setMenu(null)
        if (id) setSelection({ kind: 'card', id })
      },
    },
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
    void rf.fitView({
      nodes: [{ id: `day:${day.date}` }],
      padding: 0.08,
      maxZoom: 1,
      duration: 350,
    })
  }

  const arrange = () => {
    setSelection(null)
    setArranging(true)
    setTimeout(() => setArranging(false), 700)
    setUndo(arrangeByDays(doc, cards, trip))
    requestAnimationFrame(() => rf.fitView({ padding: 0.2, maxZoom: 1, duration: 200 }))
  }

  return (
    <BoardContext.Provider value={api}>
      {days.map(({ date }) => (
        <DayPlans key={date} date={date} onPlans={addPlans} />
      ))}
      <div
        inert={!!sheet.openId}
        className="fixed inset-0"
        onPointerDown={(e) => {
          pointers.current++
          cancelHold()
          if (pointers.current > 1 || e.pointerType === 'mouse') return
          if (!(e.target as HTMLElement).closest('.react-flow__pane')) return
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
          onConnect={(c) => {
            const id = createEdge(doc, c.source, c.target)
            if (id) setSelection({ kind: 'edge', id })
          }}
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
          connectionRadius={40}
          proOptions={{ hideAttribution: true }}
          className={cx('planer-board', arranging && 'is-arranging')}
        >
          <Background variant={BackgroundVariant.Dots} gap={28} size={1.6} />
        </ReactFlow>

        <div className="pointer-events-none absolute inset-x-px top-1 z-10 [&>*]:pointer-events-auto">
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
          <div className="island absolute bottom-[calc(72px+env(safe-area-inset-bottom))] right-1 z-10 flex items-center">
            <button
              type="button"
              onClick={() => jump(-1)}
              aria-label="poprzedni dzień"
              className="flex size-11 items-center justify-center text-muted hover:text-accent"
            >
              <ChevronLeft className="size-5" aria-hidden="true" />
            </button>
            {focused && (
              <span className="px-1 text-xs whitespace-nowrap text-subtle">
                {formatShortDate(focused)}
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
            role="menu"
            className="island absolute z-20 flex min-w-40 flex-col p-1"
            style={{
              left: Math.min(menu.x, window.innerWidth - 176),
              top: Math.min(menu.y, window.innerHeight - 180),
            }}
          >
            {menuItems.map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                onClick={item.run}
                className="min-h-11 rounded-[9px] px-3 text-left text-sm hover:bg-raised"
              >
                {item.label}
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

      {sheet.openId && (
        <CardSheet
          key={sheet.openId}
          cardId={sheet.openId}
          isNew={sheet.isNew}
          onClose={sheet.close}
        />
      )}
    </BoardContext.Provider>
  )
}

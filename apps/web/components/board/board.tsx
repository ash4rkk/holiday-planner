'use client'

import '@xyflow/react/dist/base.css'
import {
  arrangeByDays,
  CARD_SIZE,
  createCard,
  createEdge,
  createFrame,
  deleteEdge,
  deleteFrame,
  edgesOf,
  framesOf,
  moveItems,
  type Positions,
  renameFrame,
  resizeFrame,
  restorePositions,
  setEdgeLabel,
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
import { Columns3, Plus, Undo2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CardSheet } from '@/components/card/card-sheet'
import { TopBar } from '@/components/top-bar'
import { cx } from '@/components/ui'
import { useCardSheet } from '@/lib/use-card-sheet'
import { useCards, useEdges, useFrames, useTrip } from '@/lib/yjs/trip-doc'
import { type BoardApi, BoardContext, frameNodeId, type Selection } from './board-context'
import { CardNode } from './card-node'
import { FrameNode } from './frame-node'
import { SketchEdge } from './sketch-edge'

const nodeTypes = { card: CardNode, frame: FrameNode }
const edgeTypes = { sketch: SketchEdge }
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

function BoardCanvas() {
  const { trip, doc, ready } = useTrip()
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
  const [savedViewport] = useState(() =>
    typeof window === 'undefined' ? undefined : readViewport(trip.id),
  )
  const drag = useRef<{
    start: Map<string, { x: number; y: number }>
    dx: number
    dy: number
  } | null>(null)

  const live = useMemo(() => cards.filter((c) => !c.deletedAt), [cards])

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
            data: { card: c },
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
  }, [live, frames])

  const shownNodes = useMemo(
    () =>
      nodes.map((n) => {
        const selected =
          (selection?.kind === 'card' && selection.id === n.id) ||
          (selection?.kind === 'frame' && frameNodeId(selection.id) === n.id)
        return n.selected === selected ? n : { ...n, selected }
      }),
    [nodes, selection],
  )

  const shownEdges = useMemo(
    () =>
      visibleEdges(edges, cards).map((e) => ({
        id: e.id,
        source: e.from,
        target: e.to,
        type: 'sketch' as const,
        selectable: false,
        selected: selection?.kind === 'edge' && selection.id === e.id,
        data: { label: e.label },
      })),
    [edges, cards, selection],
  )

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((ns) => applyNodeChanges(changes, ns)),
    [],
  )

  // Pierwsze otwarcie bez zapisanego widoku: wszystko w kadrze.
  const fitted = useRef(false)
  useEffect(() => {
    if (!ready || savedViewport || fitted.current || !nodes.length) return
    fitted.current = true
    requestAnimationFrame(() => rf.fitView({ padding: 0.2, maxZoom: 1 }))
  }, [ready, savedViewport, nodes.length, rf])

  const nodesRef = useRef(nodes)
  nodesRef.current = nodes

  const api: BoardApi = {
    select: (sel) => {
      setMenu(null)
      setSelection(sel)
    },
    openCard: (id) => sheet.open(id),
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

  const addCard = (at: { x: number; y: number }, text?: string) => {
    const id = createCard(
      doc,
      {
        type: 'note',
        x: Math.round(at.x - CARD_SIZE.w / 2),
        y: Math.round(at.y - CARD_SIZE.h / 2),
      },
      new Date(),
      text,
    )
    setMenu(null)
    if (text) setSelection({ kind: 'card', id })
    else sheet.open(id, true)
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
        const text = await navigator.clipboard?.readText().catch(() => '')
        if (text?.trim()) addCard(menu.flow, text)
        else setMenu(null)
      },
    },
  ]

  const arrange = () => {
    setSelection(null)
    setUndo(arrangeByDays(doc, cards, trip))
    requestAnimationFrame(() => rf.fitView({ padding: 0.2, maxZoom: 1, duration: 200 }))
  }

  return (
    <BoardContext.Provider value={api}>
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
          if (
            hold.current &&
            Math.hypot(e.clientX - hold.current.x, e.clientY - hold.current.y) > 8
          )
            cancelHold()
        }}
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
          className="planer-board"
        >
          <Background variant={BackgroundVariant.Dots} gap={28} size={1.6} />
        </ReactFlow>

        <div className="pointer-events-none absolute inset-x-0.5 top-1 z-10 [&>*]:pointer-events-auto">
          <TopBar
            title={trip.title}
            actions={
              <>
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

        <button
          type="button"
          onClick={() => addCard(viewportCenter())}
          aria-label="nowa karta"
          className={cx(
            'fixed right-3 bottom-[calc(76px+env(safe-area-inset-bottom))] z-30 flex size-14 items-center justify-center',
            'rounded-island bg-accent text-on-accent hover:bg-accent-hover',
          )}
        >
          <Plus className="size-6" aria-hidden="true" />
        </button>
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

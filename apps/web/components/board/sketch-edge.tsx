'use client'

import {
  BaseEdge,
  type Edge,
  EdgeLabelRenderer,
  type EdgeProps,
  type InternalNode,
  useInternalNode,
} from '@xyflow/react'
import { Tag, Trash2 } from 'lucide-react'
import { memo, useMemo } from 'react'
import { cx } from '@/components/ui'
import { useBoard } from './board-context'
import { ToolButton } from './card-node'
import { seedOf, sketchArrowHead, sketchCurve, sketchLine } from './sketch'

export type SketchEdgeType = Edge<{ label?: string }, 'sketch'>

type Box = { x: number; y: number; w: number; h: number }

function boxOf(node: InternalNode): Box {
  const { x, y } = node.internals.positionAbsolute
  return {
    x,
    y,
    w: node.measured.width ?? node.width ?? 0,
    h: node.measured.height ?? node.height ?? 0,
  }
}

/** Punkt na brzegu prostokąta na linii od jego środka do punktu `to`. */
function borderPoint(b: Box, to: { x: number; y: number }, pad = 6) {
  const cx = b.x + b.w / 2
  const cy = b.y + b.h / 2
  const dx = to.x - cx
  const dy = to.y - cy
  if (!dx && !dy) return { x: cx, y: cy }
  const scale = Math.min(
    (b.w / 2 + pad) / Math.abs(dx || 1e-9),
    (b.h / 2 + pad) / Math.abs(dy || 1e-9),
  )
  return { x: cx + dx * scale, y: cy + dy * scale }
}

/** Jak daleko łuk wychodzi poza kolumnę; mieści się w wysepce dnia. */
const AROUND_BEND = { down: 12, up: 24 }

/**
 * Szkicowa strzałka od brzegu karty `source` do brzegu `target`. Z `around` idzie łukiem po prawej
 * stronie kolumny (z lewej stoją godziny); strzałka w górę szerzej, żeby para tam i z powrotem się
 * nie nakładała.
 */
function useArrow(id: string, source: string, target: string, around = false) {
  const s = useInternalNode(source)
  const t = useInternalNode(target)
  return useMemo(() => {
    if (!s || !t) return null
    const sb = boxOf(s)
    const tb = boxOf(t)
    const sc = { x: sb.x + sb.w / 2, y: sb.y + sb.h / 2 }
    const tc = { x: tb.x + tb.w / 2, y: tb.y + tb.h / 2 }
    const seed = seedOf(id)
    if (around && Math.abs(tc.y - sc.y) > Math.abs(tc.x - sc.x)) {
      const a = { x: sc.x + sb.w / 2 + 6, y: sc.y }
      const b = { x: tc.x + tb.w / 2 + 6, y: tc.y }
      const bend = tc.y > sc.y ? AROUND_BEND.down : AROUND_BEND.up
      const c1 = { x: a.x + bend, y: a.y }
      const c2 = { x: b.x + bend, y: b.y }
      const angle = Math.PI
      return {
        a,
        b,
        mid: { x: (a.x + b.x) / 2 + bend * 0.75, y: (a.y + b.y) / 2 },
        paths: [...sketchCurve(a, c1, c2, b, seed), ...sketchArrowHead(b.x, b.y, angle, seed)],
      }
    }
    const a = borderPoint(sb, tc)
    const b = borderPoint(tb, sc)
    const angle = Math.atan2(b.y - a.y, b.x - a.x)
    return {
      a,
      b,
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      paths: [...sketchLine(a.x, a.y, b.x, b.y, seed), ...sketchArrowHead(b.x, b.y, angle, seed)],
    }
  }, [s, t, id, around])
}

/** Swobodna szkicowa strzałka między brzegami kart, z opcjonalną etykietą. */
export const SketchEdge = memo(function SketchEdge({
  id,
  source,
  target,
  data,
  selected,
}: EdgeProps<SketchEdgeType>) {
  const board = useBoard()

  const geo = useArrow(id, source, target)
  if (!geo) return null
  const { a, b, mid, paths } = geo

  return (
    <>
      {/* Niewidoczna szeroka ścieżka łapie tap w strzałkę. */}
      <BaseEdge
        id={id}
        path={`M${a.x},${a.y} L${b.x},${b.y}`}
        interactionWidth={24}
        style={{ stroke: 'transparent' }}
      />
      {paths.map((d, i) => (
        <path
          key={i}
          d={d}
          fill="none"
          strokeWidth={1.6}
          strokeLinecap="round"
          className={cx('pointer-events-none', selected ? 'stroke-accent' : 'stroke-muted')}
        />
      ))}
      {(data?.label || selected) && (
        <EdgeLabelRenderer>
          <div
            className="nopan pointer-events-auto absolute flex items-center gap-1"
            style={{ transform: `translate(-50%, -50%) translate(${mid.x}px, ${mid.y}px)` }}
          >
            {data?.label && (
              <button
                type="button"
                onClick={() => board.select({ kind: 'edge', id })}
                className={cx(
                  'rounded-small border bg-panel px-2 py-1 text-xs italic',
                  selected ? 'border-accent text-accent' : 'border-line text-subtle',
                )}
              >
                {data.label}
              </button>
            )}
            {selected && (
              <div className="flex gap-1 rounded-island border border-line bg-panel p-1">
                <ToolButton label="etykieta strzałki" onClick={() => board.labelEdge(id)}>
                  <Tag className="size-5" aria-hidden="true" />
                </ToolButton>
                <ToolButton label="usuń strzałkę" onClick={() => board.deleteEdge(id)} danger>
                  <Trash2 className="size-5" aria-hidden="true" />
                </ToolButton>
              </div>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
})

export type OrderEdgeType = Edge<{ warn?: boolean; label?: string; around?: boolean }, 'order'>

/** Strzałka kolejności w dniu (z godzin kart, niezapisana): cieńsza, bez gestów. */
export const OrderEdge = memo(function OrderEdge({
  id,
  source,
  target,
  data,
}: EdgeProps<OrderEdgeType>) {
  const geo = useArrow(id, source, target, data?.around)
  if (!geo) return null
  return (
    <>
      {geo.paths.map((d, i) => (
        <path
          key={i}
          d={d}
          fill="none"
          strokeWidth={data?.warn ? 2 : 1.4}
          strokeLinecap="round"
          pathLength={1}
          className={cx(
            'order-arrow pointer-events-none',
            data?.warn ? 'stroke-red' : 'stroke-teal/80',
          )}
        />
      ))}
      {data?.label && (
        <EdgeLabelRenderer>
          <span
            className={cx(
              'pointer-events-none absolute rounded-small border bg-panel px-1.5 py-0.5 text-2xs whitespace-nowrap',
              data.warn ? 'border-red text-red' : 'border-line text-subtle',
            )}
            style={{
              transform: `translate(-50%, -50%) translate(${geo.mid.x}px, ${geo.mid.y}px)`,
            }}
          >
            {data.label}
          </span>
        </EdgeLabelRenderer>
      )}
    </>
  )
})

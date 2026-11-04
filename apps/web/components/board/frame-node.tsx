'use client'

import type { FrameSnapshot } from '@planer/core'
import { type Node, type NodeProps, NodeResizer, NodeToolbar, Position } from '@xyflow/react'
import { PenLine, Trash2 } from 'lucide-react'
import { memo, useMemo } from 'react'
import { cx } from '@/components/ui'
import { useBoard } from './board-context'
import { ToolButton } from './card-node'
import { seedOf, sketchRect } from './sketch'
import { useHoldDrag } from './use-hold-drag'

export type FrameNodeType = Node<{ frame: FrameSnapshot }, 'frame'>

/**
 * Ramka-grupa: szkicowy prostokąt z nazwą. Wnętrze przepuszcza gesty do tła (przesuwanie tablicy,
 * menu przytrzymania); chwyta się ją za nazwę — przesunięcie niesie jej karty.
 */
export const FrameNode = memo(function FrameNode({
  data: { frame },
  selected,
  width,
  height,
}: NodeProps<FrameNodeType>) {
  const board = useBoard()
  const w = width ?? frame.w
  const h = height ?? frame.h
  const paths = useMemo(() => sketchRect(w, h, seedOf(frame.id)), [w, h, frame.id])
  const gesture = useHoldDrag({
    onTap: () =>
      selected ? board.renameFrame(frame.id) : board.select({ kind: 'frame', id: frame.id }),
    onStart: () => board.dragStart('frame', frame.id),
    onMove: board.dragMove,
    onEnd: board.dragEnd,
    onPan: board.panBy,
  })

  return (
    <>
      <NodeResizer
        isVisible={selected}
        minWidth={200}
        minHeight={140}
        color="var(--accent)"
        handleClassName="!size-4 !rounded-full !border-2 !border-panel !bg-accent pointer-events-auto"
        lineClassName="!border-accent/40"
        onResizeEnd={(_, p) =>
          board.resizeFrame(frame.id, { x: p.x, y: p.y, w: p.width, h: p.height })
        }
      />
      <NodeToolbar isVisible={selected} position={Position.Top} align="start" offset={8}>
        <div className="flex gap-1 rounded-island border border-line bg-panel p-1">
          <ToolButton label="zmień nazwę ramki" onClick={() => board.renameFrame(frame.id)}>
            <PenLine className="size-5" aria-hidden="true" />
          </ToolButton>
          <ToolButton
            label="usuń ramkę (karty zostają)"
            onClick={() => board.deleteFrame(frame.id)}
            danger
          >
            <Trash2 className="size-5" aria-hidden="true" />
          </ToolButton>
        </div>
      </NodeToolbar>
      <svg
        width={w}
        height={h}
        className="pointer-events-none absolute inset-0 overflow-visible"
        aria-hidden="true"
      >
        <rect x={0} y={0} width={w} height={h} rx={12} className="fill-lavender/5" />
        {paths.map((d) => (
          <path
            key={d.slice(0, 24)}
            d={d}
            fill="none"
            className={cx(selected ? 'stroke-accent' : 'stroke-lavender/70')}
            strokeWidth={1.5}
          />
        ))}
      </svg>
      <div
        {...gesture}
        role="button"
        tabIndex={0}
        aria-label={`ramka ${frame.title}`}
        className={cx(
          'nopan nodrag pointer-events-auto absolute top-0 left-3 -translate-y-1/2 touch-none rounded-small border bg-panel px-3 py-1.5 font-bold text-sm',
          selected ? 'border-accent text-accent' : 'border-line text-lavender',
        )}
      >
        {frame.title}
      </div>
    </>
  )
})

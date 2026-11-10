'use client'

import { type Node, type NodeProps, NodeToolbar, Position } from '@xyflow/react'
import { ExternalLink, Luggage, X } from 'lucide-react'
import { memo } from 'react'
import { Bar, OwnerDot } from '@/components/packing/packing-ui'
import { cx } from '@/components/ui'
import { openPacking } from '@/lib/use-packing-drawer'
import { usePacking, useTrip } from '@/lib/yjs/trip-doc'
import { useBoard } from './board-context'
import { ToolButton } from './card-node'
import { useHoldDrag } from './use-hold-drag'

export type PackingNodeType = Node<Record<string, never>, 'packing'>

/**
 * Lista pakowania jako widżet Tablicy (postawiony z „+”): postęp i trzy rzeczy, które zostały.
 * Jak karta: dotknięcie zaznacza, dotknięcie zaznaczonego otwiera listę, przytrzymanie przesuwa.
 */
export const PackingNode = memo(function PackingNode({ selected }: NodeProps<PackingNodeType>) {
  const board = useBoard()
  const { user } = useTrip()
  const items = usePacking()
  const packed = items.filter((i) => i.packed).length
  const left = items.filter((i) => !i.packed)
  const gesture = useHoldDrag({
    onTap: () => (selected ? openPacking() : board.select({ kind: 'widget', id: 'packing' })),
    onStart: () => board.dragStart('widget', 'packing'),
    onMove: board.dragMove,
    onEnd: board.dragEnd,
    onPan: board.panBy,
  })

  return (
    <>
      <NodeToolbar isVisible={selected} position={Position.Top} align="start" offset={8}>
        <div className="flex gap-1 rounded-island border border-line bg-panel p-1">
          <ToolButton label="otwórz listę pakowania" onClick={openPacking}>
            <ExternalLink className="size-5" aria-hidden="true" />
          </ToolButton>
          <ToolButton label="zdejmij z tablicy" onClick={() => board.removeWidget('packing')}>
            <X className="size-5" aria-hidden="true" />
          </ToolButton>
        </div>
      </NodeToolbar>
      <div
        {...gesture}
        role="button"
        tabIndex={0}
        aria-label={`lista pakowania, spakowane ${packed} z ${items.length}`}
        className={cx(
          'island nopan nodrag pointer-events-auto flex w-full touch-none flex-col gap-2 p-3 select-none',
          selected && 'border-accent',
        )}
      >
        <div className="flex items-center gap-2">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-inner bg-active text-accent">
            <Luggage className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">lista pakowania</p>
            <p className="text-2xs text-subtle">
              {items.length === 0
                ? 'jeszcze pusta'
                : left.length
                  ? `${packed} z ${items.length} · zostało ${left.length}`
                  : '• wszystko spakowane'}
            </p>
          </div>
        </div>
        {items.length > 0 && <Bar value={packed} total={items.length} />}
        {left.length > 0 && (
          <ul className="flex flex-col gap-1 text-xs">
            {left.slice(0, 3).map((item) => (
              <li key={item.id} className="flex items-center gap-2">
                <span className="size-4 shrink-0 rounded-full border-2 border-line" />
                <span className="min-w-0 flex-1 truncate">{item.text}</span>
                <OwnerDot me={user.name} owner={item.owner} size="sm" />
              </li>
            ))}
            {left.length > 3 && (
              <li className="text-2xs text-subtle">i {left.length - 3} więcej</li>
            )}
          </ul>
        )}
      </div>
    </>
  )
})

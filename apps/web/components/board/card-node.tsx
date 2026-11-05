'use client'

import type { CardSnapshot } from '@planer/core'
import {
  Handle,
  type Node,
  type NodeProps,
  NodeToolbar,
  Position,
  useConnection,
} from '@xyflow/react'
import { Pin, PinOff, SquarePen, Trash2 } from 'lucide-react'
import { memo } from 'react'
import { VariantBadge } from '@/components/card/variant-badge'
import { cx } from '@/components/ui'
import { useBoard } from './board-context'
import { CardFace } from './card-face'
import { useHoldDrag } from './use-hold-drag'
import { ChooseButton } from './variant-node'

const SIDES = [Position.Top, Position.Right, Position.Bottom, Position.Left]

export type CardNodeType = Node<
  {
    card: CardSnapshot
    files: number
    /** Liczba wariantów tej karty. */
    variants: number
    /** Warianty rysowane obok, jako rozgałęzienie. */
    branch?: boolean
    /** Karta w zaznaczeniu kilku kart: bez narzędzi pojedynczej karty. */
    grouped?: boolean
    stayUntil?: string
  },
  'card'
>

export const CardNode = memo(function CardNode({
  id,
  data: { card, files, variants, branch, grouped, stayUntil },
  selected,
}: NodeProps<CardNodeType>) {
  const board = useBoard()
  const connecting = useConnection((c) => c.inProgress)
  const gesture = useHoldDrag({
    // Tap w zaznaczoną kartę otwiera edytor (to też podwójny tap); Ctrl i Shift zbierają karty.
    onTap: (e) => {
      if (e.ctrlKey || e.metaKey || e.shiftKey) board.toggleGroup(id)
      else if (selected && !grouped) board.openCard(id)
      else board.select({ kind: 'card', id })
    },
    onStart: () => board.dragStart('card', id),
    onMove: board.dragMove,
    onEnd: board.dragEnd,
    onPan: board.panBy,
  })

  return (
    <>
      <NodeToolbar isVisible={selected && !grouped} position={Position.Top} offset={20}>
        <div className="flex gap-1 rounded-island border border-line bg-panel p-1">
          <ToolButton label="otwórz kartę" onClick={() => board.openCard(id)}>
            <SquarePen className="size-5" aria-hidden="true" />
          </ToolButton>
          <ToolButton
            label={card.pinned ? 'odepnij' : 'przypnij'}
            onClick={() => board.togglePin(id)}
            active={card.pinned}
          >
            {card.pinned ? (
              <PinOff className="size-5" aria-hidden="true" />
            ) : (
              <Pin className="size-5" aria-hidden="true" />
            )}
          </ToolButton>
          <ToolButton label="przenieś do kosza" onClick={() => board.trash(id)} danger>
            <Trash2 className="size-5" aria-hidden="true" />
          </ToolButton>
        </div>
      </NodeToolbar>

      {variants > 0 && !branch && (
        <>
          <span className="absolute inset-0 translate-x-2 translate-y-2 rounded-island border border-line bg-panel" />
          <span className="absolute inset-0 translate-x-1 translate-y-1 rounded-island border border-line bg-panel" />
        </>
      )}

      {/* nopan: React Flow nie zaczyna tu własnego przesuwania; robi to gest karty, a karta reaguje na tap i przytrzymanie. */}
      <div
        {...gesture}
        className={cx(
          'nopan nodrag pointer-events-auto relative flex size-full touch-none flex-col gap-1 overflow-hidden rounded-island border bg-panel py-2 pr-3 pl-4',
          selected ? 'border-accent' : 'border-line',
          card.aiDraft && 'border-dashed border-accent',
        )}
        role="button"
        tabIndex={0}
        aria-label={card.title || 'karta bez tytułu'}
        onKeyDown={(e) => e.key === 'Enter' && board.openCard(id)}
      >
        <CardFace card={card} files={files} stayUntil={stayUntil} />
        {variants > 0 && !branch && (
          <VariantBadge
            card={card}
            count={variants}
            className="absolute right-2 bottom-1 rounded-small bg-panel px-1"
          />
        )}
        {branch && !card.variantChosen && <ChooseButton onClick={() => board.chooseVariant(id)} />}
      </div>

      {/* Strzałka: przeciągnięcie z kropki na krawędzi zaznaczonej karty do dowolnej innej karty.
          Kropka na każdym boku — ciągnie się w stronę celu; kształt strzałki i tak liczy SketchEdge. */}
      {SIDES.map((side) => (
        <Handle
          key={side}
          id={side}
          type="source"
          position={side}
          aria-label="narysuj strzałkę"
          className={cx(
            '!h-6 !w-6 !rounded-full !border-2 !border-panel !bg-accent transition-opacity',
            selected && !grouped ? 'opacity-100' : '!pointer-events-none opacity-0',
          )}
        />
      ))}
      <Handle
        type="target"
        position={Position.Left}
        isConnectableStart={false}
        className={cx(
          '!rounded-island !border-0 !bg-transparent',
          connecting
            ? '!inset-0 !h-full !w-full !transform-none'
            : '!pointer-events-none !opacity-0',
        )}
      />
    </>
  )
})

export function ToolButton({
  label,
  onClick,
  active,
  danger,
  children,
}: {
  label: string
  onClick: () => void
  active?: boolean
  danger?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cx(
        'flex size-11 items-center justify-center rounded-[9px] transition-colors',
        active
          ? 'bg-accent/20 text-accent'
          : danger
            ? 'text-muted hover:text-red'
            : 'text-muted hover:text-accent',
      )}
    >
      {children}
    </button>
  )
}

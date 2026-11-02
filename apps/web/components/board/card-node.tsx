'use client'

import {
  CARD_STATUS_LABELS,
  CARD_TYPE_LABELS,
  type CardSnapshot,
  formatShortDate,
} from '@planer/core'
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
import { fieldsSummary } from '@/components/card/card-fields'
import { TYPE_STYLE } from '@/components/card/type-style'
import { cx } from '@/components/ui'
import { useBoard } from './board-context'
import { useHoldDrag } from './use-hold-drag'

export type CardNodeType = Node<{ card: CardSnapshot }, 'card'>

export const CardNode = memo(function CardNode({
  id,
  data: { card },
  selected,
}: NodeProps<CardNodeType>) {
  const board = useBoard()
  const connecting = useConnection((c) => c.inProgress)
  const gesture = useHoldDrag({
    // Tap w zaznaczoną kartę otwiera edytor (to też podwójny tap).
    onTap: () => (selected ? board.openCard(id) : board.select({ kind: 'card', id })),
    onStart: () => board.dragStart('card', id),
    onMove: board.dragMove,
    onEnd: board.dragEnd,
  })
  const style = TYPE_STYLE[card.type]
  const Icon = style.icon
  const meta = [card.date && formatShortDate(card.date), fieldsSummary(card)]
    .filter(Boolean)
    .join(' · ')

  return (
    <>
      <NodeToolbar isVisible={selected} position={Position.Top} offset={8}>
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

      {/* nopan: przesuwanie tablicy jednym palcem tylko po tle; karta reaguje na tap i przytrzymanie. */}
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
        <span className={cx('absolute inset-y-0 left-0 w-1', style.bar)} aria-hidden="true" />
        <div className="flex items-start gap-2">
          <span
            className={cx(
              'flex size-7 shrink-0 items-center justify-center rounded-small',
              style.chip,
            )}
            title={CARD_TYPE_LABELS[card.type]}
          >
            <Icon className="size-4" aria-hidden="true" />
          </span>
          <span
            className={cx(
              'line-clamp-2 min-w-0 flex-1 font-bold leading-tight',
              !card.title && 'font-normal text-dim italic',
            )}
          >
            {card.title || 'bez tytułu'}
          </span>
          {card.pinned && <span className="text-accent">⌖</span>}
        </div>
        {(meta || card.status) && (
          <div className="flex items-center gap-2 text-xs">
            {meta && <span className="truncate text-subtle italic">{meta}</span>}
            {card.status && (
              <span
                className={cx(
                  'ml-auto shrink-0 rounded-small px-1.5 text-[11px]',
                  card.status === 'booked' ? 'bg-green/15 text-green' : 'bg-raised text-subtle',
                )}
              >
                {CARD_STATUS_LABELS[card.status]}
              </span>
            )}
          </div>
        )}
        {card.location?.name && (
          <span className="truncate text-xs text-subtle">⌖ {card.location.name}</span>
        )}
        {card.preview && (
          <span className="line-clamp-3 text-[13px] leading-snug text-muted">{card.preview}</span>
        )}
      </div>

      {/* Strzałka: przeciągnięcie z kropki na krawędzi zaznaczonej karty do dowolnej innej karty. */}
      <Handle
        type="source"
        position={Position.Right}
        aria-label="narysuj strzałkę"
        className={cx(
          '!h-6 !w-6 !rounded-full !border-2 !border-panel !bg-accent transition-opacity',
          selected ? 'opacity-100' : '!pointer-events-none opacity-0',
        )}
      />
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

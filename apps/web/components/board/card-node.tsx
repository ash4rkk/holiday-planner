'use client'

import type { CardSnapshot, Sky } from '@planer/core'
import { Handle, type Node, type NodeProps, Position } from '@xyflow/react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { memo, useRef, useState } from 'react'
import { TimeCell } from '@/components/card/time-cell'
import { cx } from '@/components/ui'
import { SkyLayer } from '@/components/weather'
import { useBoard } from './board-context'
import { CardFace } from './card-face'
import { CardLens, useFarZoom } from './card-lens'
import { useHoldDrag } from './use-hold-drag'
import { ChooseButton } from './variant-node'

export type CardNodeType = Node<
  {
    card: CardSnapshot
    files: number
    /** Warianty tej karty. */
    options: CardSnapshot[]
    /** Warianty rysowane obok, jako rozgałęzienie. */
    branch?: boolean
    /** Karta w zaznaczeniu kilku kart: bez narzędzi pojedynczej karty. */
    grouped?: boolean
    stayUntil?: string
    /** Deszcz albo burza w godzinach karty: animacja w tle. */
    sky?: Sky
  },
  'card'
>

export const CardNode = memo(function CardNode({
  id,
  data: { card, files, options, branch, grouped, stayUntil, sky },
  selected,
}: NodeProps<CardNodeType>) {
  const board = useBoard()
  // Podgląd opcji w stosie jest lokalny: plan zmienia dopiero „wybierz”.
  const [shownIndex, setShownIndex] = useState(0)
  const all = [card, ...options]
  const stacked = options.length > 0 && !branch
  const index = stacked ? shownIndex % all.length : 0
  const shown = all[index] ?? card
  const onAxis = Boolean(card.date && card.time)
  // Lupa przy oddalonej Tablicy: najechanie myszą albo zaznaczona karta (dotyk).
  const far = useFarZoom()
  const [hover, setHover] = useState(false)
  const body = useRef<HTMLDivElement>(null)
  const step = (by: number) => setShownIndex((index + by + all.length) % all.length)
  const gesture = useHoldDrag({
    // Tap w zaznaczoną kartę otwiera edytor (to też podwójny tap); Ctrl i Shift zbierają karty.
    onTap: (e) => {
      if (e.ctrlKey || e.metaKey || e.shiftKey) board.toggleGroup(id)
      else if (selected && !grouped) board.openCard(shown.id)
      else board.select({ kind: 'card', id })
    },
    onStart: () => board.dragStart('card', id),
    onMove: board.dragMove,
    onEnd: board.dragEnd,
    onPan: board.panBy,
    onMenu: (x, y) => board.openMenu(id, x, y),
  })

  return (
    <>
      {onAxis && (
        <TimeCell card={shown} className="pointer-events-none absolute top-2 right-full mr-2" />
      )}
      {far && (hover || selected) && !grouped && <CardLens anchor={body} card={shown} />}

      {stacked && (
        <>
          <span className="absolute inset-0 translate-x-2 translate-y-2 rounded-island border border-line bg-panel" />
          <span className="absolute inset-0 translate-x-1 translate-y-1 rounded-island border border-line bg-panel" />
        </>
      )}

      {/* nopan: React Flow nie zaczyna tu własnego przesuwania; robi to gest karty, a karta reaguje na tap i przytrzymanie. */}
      <div
        {...gesture}
        ref={body}
        onPointerEnter={(e) => e.pointerType === 'mouse' && setHover(true)}
        onPointerLeave={() => setHover(false)}
        className={cx(
          'nopan nodrag pointer-events-auto relative isolate flex size-full touch-none flex-col gap-1 overflow-hidden rounded-island border bg-panel py-2 pr-3 pl-4',
          selected ? 'border-accent' : 'border-line',
          card.aiDraft && 'border-dashed border-accent',
          card.skipped && 'opacity-60',
        )}
        role="button"
        tabIndex={0}
        aria-label={card.title || 'karta bez tytułu'}
        onKeyDown={(e) => e.key === 'Enter' && board.openCard(id)}
      >
        {index === 0 && <SkyLayer sky={sky} />}
        <CardFace
          card={shown}
          files={files}
          stayUntil={index ? undefined : stayUntil}
          onAxis={onAxis}
          footerSpace={stacked}
        />
        {stacked && (
          <div className="absolute inset-x-1 bottom-1 flex items-center gap-1 bg-panel">
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label="poprzednia opcja"
              className="hit flex size-9 items-center justify-center rounded-small border border-line text-muted"
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
            </button>
            <span className="text-xs text-subtle">
              {index + 1} / {all.length}
            </span>
            <button
              type="button"
              onClick={() => step(1)}
              aria-label="następna opcja"
              className="hit flex size-9 items-center justify-center rounded-small border border-line text-muted"
            >
              <ChevronRight className="size-4" aria-hidden="true" />
            </button>
            <span className="flex-1" />
            {(index > 0 || !card.variantChosen) && (
              <button
                type="button"
                onClick={() => {
                  setShownIndex(0)
                  board.chooseVariant(shown.id)
                }}
                className="hit min-h-9 px-2 text-xs font-bold text-accent"
              >
                wybierz
              </button>
            )}
          </div>
        )}
        {branch && !card.variantChosen && <ChooseButton onClick={() => board.chooseVariant(id)} />}
      </div>

      {/* Niewidoczne: React Flow rysuje strzałki tylko między węzłami z uchwytami. */}
      <Handle
        type="source"
        position={Position.Bottom}
        isConnectable={false}
        className="!pointer-events-none !opacity-0"
      />
      <Handle
        type="target"
        position={Position.Top}
        isConnectable={false}
        className="!pointer-events-none !opacity-0"
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
        'flex size-11 items-center justify-center rounded-inner transition-colors',
        active
          ? 'bg-active text-accent'
          : danger
            ? 'text-muted hover:text-red'
            : 'text-muted hover:text-accent',
      )}
    >
      {children}
    </button>
  )
}

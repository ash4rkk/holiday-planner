'use client'

import type { CardSnapshot } from '@planer/core'
import { ChevronDown, ChevronRight, Lightbulb } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { AmountBadge } from '@/components/amounts'
import { fieldsSummary } from '@/components/card/card-fields'
import { TYPE_STYLE } from '@/components/card/type-style'
import { VariantBadge } from '@/components/card/variant-badge'
import { cx } from '@/components/ui'
import { useHoldDrag } from './use-hold-drag'

export const PANEL_WIDTH = 320

/** Przyciski Tablicy: na szerokim ekranie w linii z dolnym menu, na telefonie rząd wyżej. */
export function controlsBottom(wide: boolean): string {
  return wide ? 'max(8px, env(safe-area-inset-bottom))' : 'calc(72px + env(safe-area-inset-bottom))'
}

export type IdeaDrag = {
  start: (card: CardSnapshot, x: number, y: number) => void
  move: (card: CardSnapshot, x: number, y: number) => void
  end: (card: CardSnapshot) => void
}

// Palec po przytrzymaniu ciągnie kartę, więc przeglądarka nie może już przewijać listy.
const stopScroll = (e: TouchEvent) => e.preventDefault()

function IdeaCard({
  card,
  variants,
  drag,
  onOpen,
}: {
  card: CardSnapshot
  variants: number
  drag: IdeaDrag
  onOpen: () => void
}) {
  const from = useRef({ x: 0, y: 0 })
  useEffect(() => () => document.removeEventListener('touchmove', stopScroll), [])
  const gesture = useHoldDrag({
    onTap: onOpen,
    onStart: (x, y) => {
      from.current = { x, y }
      document.addEventListener('touchmove', stopScroll, { passive: false })
      drag.start(card, x, y)
    },
    onMove: (dx, dy) => drag.move(card, from.current.x + dx, from.current.y + dy),
    onEnd: () => {
      document.removeEventListener('touchmove', stopScroll)
      drag.end(card)
    },
  })
  const style = TYPE_STYLE[card.type]
  const Icon = style.icon
  return (
    <div
      {...gesture}
      role="button"
      tabIndex={0}
      aria-label={card.title || 'karta bez tytułu'}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
      className="relative flex min-h-20 touch-pan-y flex-col gap-1 overflow-hidden rounded-island border border-line bg-panel py-2 pr-2 pl-3 select-none"
    >
      <span className={cx('absolute inset-y-0 left-0 w-1', style.bar)} aria-hidden="true" />
      <div className="flex items-start gap-2">
        <span
          className={cx(
            'flex size-6 shrink-0 items-center justify-center rounded-small',
            style.chip,
          )}
        >
          <Icon className="size-3.5" aria-hidden="true" />
        </span>
        <span
          className={cx(
            'line-clamp-2 min-w-0 flex-1 text-sm font-bold leading-tight',
            !card.title && 'font-normal text-dim italic',
          )}
        >
          {card.title || 'bez tytułu'}
        </span>
      </div>
      <span className="truncate text-xs text-subtle italic">
        {card.location?.name ?? fieldsSummary(card)}
      </span>
      <div className="flex items-center gap-2">
        <AmountBadge amounts={card.amounts ?? []} />
        {variants > 0 && <VariantBadge card={card} count={variants} />}
      </div>
    </div>
  )
}

/**
 * Pomysły, czyli karty bez dnia: na telefonie wysuwane od dołu, na szerokim ekranie stały panel obok
 * Tablicy. Miejsca oznaczone `data-ideas-drop` przyjmują karty przeciągnięte z Tablicy.
 */
export function IdeasDrawer({
  ideas,
  variants,
  open,
  wide,
  dragging,
  drag,
  onToggle,
  onOpenCard,
}: {
  ideas: CardSnapshot[]
  variants: Map<string, CardSnapshot[]>
  open: boolean
  wide: boolean
  /** Karta z Tablicy jest w ruchu: przycisk robi się miejscem upuszczenia. */
  dragging: boolean
  drag: IdeaDrag
  onToggle: () => void
  onOpenCard: (id: string) => void
}) {
  const Close = wide ? ChevronRight : ChevronDown
  return (
    <>
      {!open && (
        <button
          type="button"
          data-ideas-drop
          onClick={onToggle}
          aria-label={`pomysły (${ideas.length})`}
          style={{ bottom: controlsBottom(wide) }}
          className={cx(
            'island absolute left-1 z-10 flex h-11 items-center gap-2 px-3 text-sm',
            dragging
              ? 'right-1 justify-center border-dashed border-accent text-accent'
              : 'text-muted',
          )}
        >
          <Lightbulb className="size-5" aria-hidden="true" />
          {dragging ? 'do pomysłów' : ideas.length}
        </button>
      )}
      <aside
        aria-label="pomysły"
        aria-hidden={!open}
        inert={!open}
        data-ideas-drop
        className={cx(
          'fixed z-[35] flex flex-col bg-bg transition-transform duration-200 motion-reduce:transition-none',
          wide
            ? 'inset-y-0 right-0 border-l border-line'
            : 'inset-x-0 bottom-0 h-[55dvh] rounded-t-island border-t border-line',
          !open && (wide ? 'translate-x-full' : 'translate-y-full'),
        )}
        style={wide ? { width: PANEL_WIDTH } : undefined}
      >
        <div className="flex shrink-0 items-center gap-2 pl-3">
          <h2 className="flex-1 text-sm font-bold">pomysły · {ideas.length}</h2>
          <button
            type="button"
            onClick={onToggle}
            aria-label="zwiń pomysły"
            className="flex size-11 items-center justify-center text-muted hover:text-accent"
          >
            <Close className="size-5" aria-hidden="true" />
          </button>
        </div>
        {ideas.length ? (
          <div
            className={cx(
              'grid flex-1 content-start gap-1 overflow-y-auto overscroll-y-contain p-1',
              // Na telefonie dolne menu leży nad drawerem.
              wide ? 'grid-cols-1' : 'grid-cols-2 pb-[calc(72px+env(safe-area-inset-bottom))]',
            )}
          >
            {ideas.map((c) => (
              <IdeaCard
                key={c.id}
                card={c}
                variants={variants.get(c.id)?.length ?? 0}
                drag={drag}
                onOpen={() => onOpenCard(c.id)}
              />
            ))}
          </div>
        ) : (
          <p className="px-3 py-4 text-sm text-subtle italic">
            karty bez dnia czekają tutaj · przeciągnij je na dzień
          </p>
        )}
      </aside>
    </>
  )
}

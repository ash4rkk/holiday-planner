'use client'

import type { CardSnapshot } from '@planer/core'
import { ChevronDown, ChevronRight, Lightbulb } from 'lucide-react'
import { type PointerEvent, type TouchEvent, useEffect, useRef, useState } from 'react'
import { AmountBadge } from '@/components/amounts'
import { fieldsSummary } from '@/components/card/card-fields'
import { TYPE_STYLE } from '@/components/card/type-style'
import { VariantBadge } from '@/components/card/variant-badge'
import { cx } from '@/components/ui'
import { useHoldDrag } from './use-hold-drag'

export const PANEL_WIDTH = 320
/** Tyle trzeba pociągnąć w dół, żeby schować drawer (jak arkusz karty). */
const DRAG_CLOSE_PX = 110

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
const stopScroll = (e: globalThis.TouchEvent) => e.preventDefault()

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
            !card.title && 'font-normal text-subtle',
          )}
        >
          {card.title || 'bez tytułu'}
        </span>
      </div>
      <span className="truncate text-xs text-subtle">
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

  // Przeciągnięcie w dół chowa drawer (telefon): za uchwyt i nagłówek albo z listy przewiniętej do góry.
  const [dragY, setDragY] = useState(0)
  const from = useRef<number | null>(null)
  const pulled = useRef(0)
  const list = useRef<HTMLDivElement>(null)
  const startPull = (y: number) => {
    from.current = y
    pulled.current = 0
  }
  const movePull = (y: number) => {
    if (from.current === null) return
    pulled.current = y - from.current
    setDragY(Math.max(0, pulled.current))
  }
  const endPull = () => {
    if (from.current === null) return
    from.current = null
    setDragY(0)
    if (pulled.current > DRAG_CLOSE_PX) onToggle()
  }
  const handle = wide
    ? {}
    : {
        onPointerDown: (e: PointerEvent) => {
          // Przyciski w nagłówku działają zwyczajnie; ciągnie się resztą paska.
          if ((e.target as HTMLElement).closest('button')) return
          startPull(e.clientY)
          e.currentTarget.setPointerCapture(e.pointerId)
        },
        onPointerMove: (e: PointerEvent) => movePull(e.clientY),
        onPointerUp: endPull,
        onPointerCancel: endPull,
      }
  // Lista: ciągnięcie w dół, gdy jest przewinięta do samej góry (dalej przewija się normalnie).
  const listPull = wide
    ? {}
    : {
        onTouchStart: (e: TouchEvent) => {
          const t = e.touches[0]
          if (t && e.touches.length === 1 && (list.current?.scrollTop ?? 0) <= 0) {
            from.current = t.clientY
            pulled.current = 0
          } else from.current = null
        },
        onTouchMove: (e: TouchEvent) => {
          const t = e.touches[0]
          if (!t || from.current === null) return
          // W górę to zwykłe przewijanie listy.
          if (t.clientY < from.current) {
            from.current = null
            setDragY(0)
            return
          }
          movePull(t.clientY)
        },
        onTouchEnd: endPull,
        onTouchCancel: endPull,
      }

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
            'island absolute left-1 z-(--z-overlay) flex h-11 items-center gap-2 px-3 text-sm',
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
          'fixed z-(--z-drawer) flex flex-col bg-bg motion-reduce:transition-none',
          from.current === null && 'transition-transform duration-200',
          wide
            ? 'inset-y-0 right-0 border-l border-line'
            : 'inset-x-0 bottom-0 h-[60dvh] rounded-t-island border-t border-line',
          !open && (wide ? 'translate-x-full' : 'translate-y-full'),
        )}
        style={{
          ...(wide && { width: PANEL_WIDTH }),
          ...(open && dragY > 0 && { transform: `translateY(${dragY}px)` }),
        }}
      >
        <div {...handle} className={cx('shrink-0', !wide && 'touch-none')}>
          {!wide && (
            <div aria-hidden="true" className="flex h-6 items-center justify-center">
              <span className="h-1 w-10 rounded-full bg-line" />
            </div>
          )}
          <div className={cx('flex items-center gap-1 p-1', !wide && 'pt-0')}>
            <button
              type="button"
              onClick={onToggle}
              aria-label="zwiń pomysły"
              className="island flex size-11 items-center justify-center text-muted hover:text-accent"
            >
              <Close className="size-5" aria-hidden="true" />
            </button>
            <h2 className="flex h-11 items-center gap-2 rounded-island bg-active px-3 text-sm text-accent">
              <Lightbulb className="size-5" aria-hidden="true" />
              pomysły
              <span className="font-bold">{ideas.length}</span>
            </h2>
          </div>
        </div>
        {ideas.length ? (
          <div
            ref={list}
            {...listPull}
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
          <p className="px-3 py-4 text-sm text-subtle">
            karty bez dnia i miejsca udostępnione z Map Google czekają tutaj · przeciągnij je na
            dzień
          </p>
        )}
      </aside>
    </>
  )
}

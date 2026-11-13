'use client'

import type { CardSnapshot } from '@planer/core'
import { ChevronDown, Lightbulb, Minus } from 'lucide-react'
import { type PointerEvent, type TouchEvent, useEffect, useRef, useState } from 'react'
import { AmountBadge } from '@/components/amounts'
import { fieldsSummary } from '@/components/card/card-fields'
import { OffMapMark } from '@/components/card/off-map-mark'
import { TYPE_STYLE } from '@/components/card/type-style'
import { VariantBadge } from '@/components/card/variant-badge'
import { cx } from '@/components/ui'
import { useHoldDrag } from './use-hold-drag'

/** Szerokość wysepki pomysłów na szerokim ekranie. */
export const PANEL_WIDTH = 300
/** Wysepka pomysłów pod górnym paskiem (h-11 + odstępy). */
const ISLAND_TOP = 'calc(64px + env(safe-area-inset-top))'
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
      className="relative flex min-h-14 touch-pan-y items-center gap-2 overflow-hidden rounded-inner border border-line bg-panel py-1.5 pr-2 pl-3 select-none"
    >
      <span className={cx('absolute inset-y-0 left-0 w-1', style.bar)} aria-hidden="true" />
      <span
        className={cx('flex size-7 shrink-0 items-center justify-center rounded-small', style.chip)}
      >
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span
          className={cx(
            'truncate text-sm font-bold leading-tight',
            !card.title && 'font-normal text-subtle',
          )}
        >
          {card.title || 'bez tytułu'}
        </span>
        <span className="truncate text-xs text-subtle">
          {card.location?.name ?? fieldsSummary(card)}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5">
        <OffMapMark card={card} />
        <AmountBadge amounts={card.amounts ?? []} />
        {variants > 0 && <VariantBadge card={card} count={variants} />}
      </span>
    </div>
  )
}

/**
 * Pomysły, czyli karty bez dnia, w pływającej wysepce o wysokości treści: na szerokim ekranie
 * w prawym górnym rogu, na telefonie nad menu dolnym (rośnie z pigułki „pomysły N”).
 * Miejsca oznaczone `data-ideas-drop` przyjmują karty przeciągnięte z Tablicy.
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
  const Close = wide ? Minus : ChevronDown

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
          style={wide ? { top: ISLAND_TOP } : { bottom: controlsBottom(wide) }}
          className={cx(
            'absolute z-(--z-overlay) flex items-center gap-2 text-sm',
            wide
              ? 'right-2 h-11 rounded-full border border-sel bg-raised px-4 shadow-float'
              : // Ta sama wysepka co przełącznik dni po prawej (wysokość, kształt, cień).
                'left-2 h-[50px] rounded-full border border-sel bg-raised px-4 shadow-float',
            dragging
              ? cx(
                  'justify-center border-dashed border-accent text-accent',
                  wide ? 'h-16 w-[300px]' : 'right-2',
                )
              : 'text-muted hover:text-text',
          )}
        >
          <Lightbulb className={cx('size-5', !dragging && 'text-accent')} aria-hidden="true" />
          {dragging ? 'do pomysłów' : wide ? `pomysły ${ideas.length}` : ideas.length}
        </button>
      )}
      <aside
        aria-label="pomysły"
        aria-hidden={!open}
        inert={!open}
        data-ideas-drop
        className={cx(
          'fixed z-(--z-drawer) flex flex-col rounded-island border border-sel bg-raised p-1 shadow-float',
          // Puszczony po pociągnięciu wraca płynnie; w trakcie idzie za palcem bez opóźnienia.
          from.current === null
            ? 'transition-[scale,opacity,transform]'
            : 'transition-[scale,opacity]',
          'duration-200 motion-reduce:transition-none',
          wide
            ? 'right-2 max-h-[calc(100dvh-64px-150px)] origin-top-right'
            : 'inset-x-2 max-h-[min(60dvh,calc(100dvh-72px-140px))] origin-bottom-left',
          !open && 'pointer-events-none scale-90 opacity-0',
        )}
        style={{
          ...(wide ? { width: PANEL_WIDTH, top: ISLAND_TOP } : { bottom: controlsBottom(false) }),
          ...(open && dragY > 0 && { transform: `translateY(${dragY}px)` }),
        }}
      >
        {/* Na telefonie nagłówek ciągnięty w dół chowa wysepkę. */}
        <div
          {...handle}
          className={cx('flex shrink-0 items-center gap-2 pl-2.5', !wide && 'touch-none')}
        >
          <Lightbulb className="size-4 text-accent" aria-hidden="true" />
          <h2 className="text-sm font-bold">pomysły</h2>
          <span className="text-xs text-subtle">{ideas.length}</span>
          <button
            type="button"
            onClick={onToggle}
            aria-label="zwiń pomysły"
            className="ml-auto flex size-10 items-center justify-center rounded-inner text-muted hover:text-accent"
          >
            <Close className="size-4" aria-hidden="true" />
          </button>
        </div>
        {ideas.length ? (
          <div
            ref={list}
            {...listPull}
            className="grid min-h-0 flex-1 content-start gap-1 overflow-y-auto overscroll-y-contain"
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
          <p className="px-2.5 pb-2 text-sm text-subtle">
            karty bez dnia i miejsca udostępnione z Map Google czekają tutaj · przeciągnij je na
            dzień
          </p>
        )}
        {ideas.length > 0 && (
          <p className="shrink-0 py-1.5 text-center text-2xs text-subtle">
            {wide ? 'przeciągnij na dzień' : 'przytrzymaj i przeciągnij na dzień'}
          </p>
        )}
      </aside>
    </>
  )
}

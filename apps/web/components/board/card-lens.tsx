'use client'

import { arrivalLabel, type CardSnapshot, formatAmount, sumByCurrency } from '@planer/core'
import { useStore } from '@xyflow/react'
import { type RefObject, useLayoutEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { formatDuration, TYPE_STYLE } from '@/components/card/type-style'
import { cx } from '@/components/ui'

/** Poniżej tego zbliżenia tytuł karty (14 px) spada pod 11 px — wtedy pomaga lupa. */
export const FAR_ZOOM = 0.8

/** Czy Tablica jest oddalona. Zmienia się tylko przy progu, więc karty nie przerysowują się w ruchu. */
export function useFarZoom(): boolean {
  return useStore((s) => s.transform[2] < FAR_ZOOM)
}

const GAP = 8

/**
 * Lupa: przy oddalonej Tablicy dymek nad kartą (najechanie myszą albo zaznaczenie dotknięciem)
 * z tytułem, godziną i kwotą w zwykłej wielkości. Karta sama się nie zmienia. Portal do `body`,
 * więc dymku nie zasłaniają sąsiednie karty ani skala Tablicy; przy przesuwaniu jedzie za kartą.
 */
export function CardLens({
  anchor,
  card,
}: {
  anchor: RefObject<HTMLElement | null>
  card: CardSnapshot
}) {
  // Subskrypcja przesunięcia i skali: dymek liczy położenie od nowa przy każdym ruchu Tablicy.
  const transform = useStore((s) => s.transform)
  const [pos, setPos] = useState<{ left: number; top: number; below: boolean } | null>(null)

  useLayoutEffect(() => {
    void transform
    const r = anchor.current?.getBoundingClientRect()
    if (!r) return
    // Nad kartą, a gdy brak miejsca u góry — pod nią; w poziomie w granicach ekranu.
    const below = r.top < 90
    setPos({
      left: Math.min(Math.max(8, r.left), window.innerWidth - 248),
      top: below ? r.bottom + GAP : r.top - GAP,
      below,
    })
  }, [anchor, transform])

  if (!pos) return null
  const style = TYPE_STYLE[card.type]
  const Icon = style.icon
  const amounts = sumByCurrency(card.amounts ?? [])
  const when = [
    card.time && (arrivalLabel(card) ? `${card.time} → ${arrivalLabel(card)}` : card.time),
    !card.endTime && card.durationMin !== undefined && formatDuration(card.durationMin),
    amounts.length > 0 && amounts.map(formatAmount).join(' + '),
  ]
    .filter(Boolean)
    .join(' · ')

  return createPortal(
    <div
      role="tooltip"
      className={cx(
        'island pop-in pointer-events-none fixed z-(--z-popover) flex w-60 gap-2 p-2 shadow-float',
        !pos.below && '-translate-y-full',
      )}
      style={{ left: pos.left, top: pos.top }}
    >
      <Icon className={cx('mt-0.5 size-4 shrink-0', style.text)} aria-hidden="true" />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="font-bold leading-tight">{card.title || 'bez tytułu'}</span>
        {when && <span className="text-xs text-muted tabular-nums">{when}</span>}
        {card.location?.name && (
          <span className="truncate text-xs text-subtle">⌖ {card.location.name}</span>
        )}
      </span>
    </div>,
    document.body,
  )
}

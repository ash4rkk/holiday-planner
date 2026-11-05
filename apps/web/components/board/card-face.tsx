'use client'

import { CARD_TYPE_LABELS, type CardSnapshot, formatShortDate } from '@planer/core'
import { AmountBadge } from '@/components/amounts'
import { fieldsSummary } from '@/components/card/card-fields'
import { CardMetaLine } from '@/components/card/card-tile'
import { StatusMark } from '@/components/card/status-mark'
import { TYPE_STYLE } from '@/components/card/type-style'
import { cx } from '@/components/ui'

/** Treść karty na Tablicy: ta sama w karcie głównej i w wariancie. */
export function CardFace({
  card,
  files,
  stayUntil,
}: {
  card: CardSnapshot
  files: number
  /** Karta bez czasu trwania: do kiedy można zostać. */
  stayUntil?: string
}) {
  const style = TYPE_STYLE[card.type]
  const Icon = style.icon
  const meta = [card.date && formatShortDate(card.date), fieldsSummary(card)]
    .filter(Boolean)
    .join(' · ')
  return (
    <>
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
        {card.status && <StatusMark status={card.status} />}
      </div>
      {(meta || card.amounts?.length > 0) && (
        <div className="flex items-center gap-2 text-xs">
          {meta && <span className="truncate text-subtle italic">{meta}</span>}
          <AmountBadge amounts={card.amounts ?? []} className="ml-auto" />
        </div>
      )}
      <CardMetaLine card={card} files={files} />
      {stayUntil && <span className="text-xs text-teal">możesz zostać do {stayUntil}</span>}
      {card.preview && (
        <span className="line-clamp-3 text-[13px] leading-snug text-muted">{card.preview}</span>
      )}
    </>
  )
}

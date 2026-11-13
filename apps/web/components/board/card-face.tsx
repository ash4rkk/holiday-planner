'use client'

import {
  CARD_TYPE_LABELS,
  type CardSnapshot,
  formatAmount,
  formatShortDate,
  placeLine,
  sumByCurrency,
} from '@planer/core'
import { Paperclip } from 'lucide-react'
import { fieldsSummary } from '@/components/card/card-fields'
import { OffMapMark } from '@/components/card/off-map-mark'
import { StatusMark } from '@/components/card/status-mark'
import { TYPE_STYLE } from '@/components/card/type-style'
import { cx } from '@/components/ui'

const norm = (s: string) => s.trim().toLocaleLowerCase('pl')

function hostOf(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return undefined
  }
}

/**
 * Treść karty na Tablicy (ta sama w karcie głównej i w wariancie): pasek typu z lewej, tytuł z małą
 * ikoną typu, opis, a wszystko pomocnicze w dolnym wierszu — kwota · status · daty, z prawej miejsce
 * (gdy różni się od tytułu) albo domena linku. `footerSpace`: miejsce na przyciski wariantów pod spodem.
 */
export function CardFace({
  card,
  files,
  stayUntil,
  onAxis = false,
  footerSpace = false,
}: {
  card: CardSnapshot
  files: number
  /** Karta bez czasu trwania: do kiedy można zostać. */
  stayUntil?: string
  /** Karta w dniu: data wynika z wysepki, a godzina i czas stoją w kolumnie obok. */
  onAxis?: boolean
  footerSpace?: boolean
}) {
  const style = TYPE_STYLE[card.type]
  const Icon = style.icon
  const when = onAxis
    ? fieldsSummary({ ...card, time: undefined, durationMin: undefined })
    : [card.date && formatShortDate(card.date), fieldsSummary(card)].filter(Boolean).join(' · ')
  const amounts = sumByCurrency(card.amounts ?? [])
  const domain = card.linkPreview?.url ? hostOf(card.linkPreview.url) : undefined
  // Miejsce o tej samej nazwie co karta nic nie dodaje (np. „Mosteiro dos Jerónimos” dwa razy).
  const placeName = placeLine(card)
  const place =
    placeName && norm(placeName) !== norm(card.title) ? `⌖ ${placeName}` : domain && `↗ ${domain}`
  const footer = amounts.length > 0 || card.status || when || files > 0 || place

  return (
    <>
      <span className={cx('absolute inset-y-0 left-0 w-1', style.bar)} aria-hidden="true" />
      <div className="flex items-start gap-2">
        <span
          className={cx(
            'line-clamp-2 min-w-0 flex-1 font-bold leading-tight',
            !card.title && 'font-normal text-subtle',
            card.skipped && 'text-subtle line-through',
          )}
        >
          {card.title || 'bez tytułu'}
        </span>
        {card.pinned && <span className="text-accent">⌖</span>}
        <OffMapMark card={card} />
        <span className="pt-0.5" title={CARD_TYPE_LABELS[card.type]}>
          <Icon className={cx('size-4', style.text)} aria-hidden="true" />
          <span className="sr-only">{CARD_TYPE_LABELS[card.type]}</span>
        </span>
      </div>
      {card.preview && (
        <span className="line-clamp-3 text-sm leading-snug text-muted">{card.preview}</span>
      )}
      {stayUntil && <span className="text-xs text-muted">możesz zostać do {stayUntil}</span>}
      {footer && (
        <div
          className={cx(
            'mt-auto flex min-w-0 items-center gap-1.5 text-xs text-subtle',
            footerSpace && 'mb-10',
          )}
        >
          {amounts.length > 0 && (
            <span className="shrink-0 font-bold text-text tabular-nums">
              {amounts.map(formatAmount).join(' + ')}
            </span>
          )}
          {amounts.length > 0 && card.status && <span aria-hidden="true">·</span>}
          {card.status && <StatusMark status={card.status} inline />}
          {when && (amounts.length > 0 || card.status) && <span aria-hidden="true">·</span>}
          {when && <span className="shrink-0">{when}</span>}
          {files > 0 && (
            <span
              className="flex shrink-0 items-center gap-0.5 text-accent"
              title={`załączniki: ${files}`}
            >
              <Paperclip className="size-3" aria-hidden="true" />
              {files}
            </span>
          )}
          {place && <span className="ml-auto min-w-0 truncate">{place}</span>}
        </div>
      )}
    </>
  )
}

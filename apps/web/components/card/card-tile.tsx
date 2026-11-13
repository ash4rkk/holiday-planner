import { CARD_TYPE_LABELS, type CardSnapshot, placeLine, type Sky } from '@planer/core'
import { Paperclip } from 'lucide-react'
import { memo, useRef, useState } from 'react'
import { AmountBadge } from '@/components/amounts'
import { cx } from '@/components/ui'
import { SkyLayer } from '@/components/weather'
import { fieldsSummary } from './card-fields'
import { OffMapMark } from './off-map-mark'
import { StatusMark } from './status-mark'
import { TYPE_STYLE } from './type-style'
import { VariantBadge } from './variant-badge'

const HOLD_MS = 450
const FRESH_MS = 2500

/**
 * Kafelek karty. `memo` z porównaniem bez funkcji: rodzic tworzy `onOpen`/`onHold` przy każdym
 * renderze, a znaczenie mają tylko dane karty — dzięki współdzielonym migawkom pisanie w jednej
 * karcie przerysowuje tylko jej kafelek.
 */
export const CardTile = memo(
  CardTileView,
  (a, b) =>
    a.card === b.card &&
    a.files === b.files &&
    a.variants === b.variants &&
    a.stayUntil === b.stayUntil &&
    a.sky === b.sky &&
    a.inDay === b.inDay &&
    Boolean(a.onHold) === Boolean(b.onHold),
)

function CardTileView({
  card,
  files = 0,
  variants = 0,
  stayUntil,
  inDay = false,
  sky,
  onOpen,
  onHold,
}: {
  card: CardSnapshot
  /** Liczba załączników karty. */
  files?: number
  /** Liczba wariantów tej karty. */
  variants?: number
  /** Karta bez czasu trwania: do kiedy można zostać. */
  stayUntil?: string
  /** Deszcz albo burza w godzinach karty: animacja w tle. */
  sky?: Sky
  /** Karta na osi dnia: godzina i czas stoją w kolumnie obok, ikona jest mniejsza. */
  inDay?: boolean
  onOpen: () => void
  /** Przytrzymanie karty (przeniesienie na inny dzień). */
  onHold?: () => void
}) {
  // Świeżo dodana karta wskakuje na miejsce; reszta listy się nie rusza.
  const [fresh] = useState(() => Date.now() - Date.parse(card.createdAt) < FRESH_MS)
  const hold = useRef<{ x: number; y: number; timer: ReturnType<typeof setTimeout> } | null>(null)
  const held = useRef(false)
  const cancelHold = () => {
    if (hold.current) clearTimeout(hold.current.timer)
    hold.current = null
  }
  const style = TYPE_STYLE[card.type]
  const Icon = style.icon
  const summary = fieldsSummary(inDay ? { ...card, time: undefined, durationMin: undefined } : card)

  return (
    <button
      type="button"
      onClick={() => {
        if (held.current) held.current = false
        else onOpen()
      }}
      onPointerDown={(e) => {
        if (!onHold) return
        const timer = setTimeout(() => {
          held.current = true
          navigator.vibrate?.(10)
          onHold()
        }, HOLD_MS)
        hold.current = { x: e.clientX, y: e.clientY, timer }
      }}
      onPointerMove={(e) => {
        const h = hold.current
        if (h && Math.hypot(e.clientX - h.x, e.clientY - h.y) > 8) cancelHold()
      }}
      onPointerUp={cancelHold}
      onPointerCancel={cancelHold}
      onContextMenu={(e) => onHold && e.preventDefault()}
      className={cx(
        'island relative isolate flex w-full gap-3 overflow-hidden py-3 pr-3 pl-4 text-left transition-colors select-none hover:border-sel',
        card.aiDraft && 'border-dashed border-accent',
        fresh && 'pop-in',
        card.skipped && 'opacity-50',
      )}
    >
      <SkyLayer sky={sky} />
      {sky && <span className="sr-only">{sky === 'storm' ? 'w czasie burzy' : 'w deszczu'}</span>}
      <span className={cx('absolute inset-y-0 left-0 w-1', style.bar)} aria-hidden="true" />
      <span className="flex shrink-0 flex-col items-center gap-1">
        <span
          className={cx(
            'flex shrink-0 items-center justify-center rounded-small',
            inDay ? 'size-7' : 'size-9',
            style.chip,
          )}
          title={CARD_TYPE_LABELS[card.type]}
        >
          <Icon className="size-4" aria-hidden="true" />
          <span className="sr-only">{CARD_TYPE_LABELS[card.type]}</span>
        </span>
        {variants > 0 && <VariantBadge card={card} count={variants} />}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-baseline gap-2">
          <span
            className={cx(
              'truncate font-bold',
              !card.title && 'font-normal text-subtle',
              card.skipped && 'line-through',
            )}
          >
            {card.title || 'bez tytułu'}
          </span>
          {card.skipped && <span className="shrink-0 text-xs text-subtle">pominięta</span>}
          <span className="ml-auto flex shrink-0 items-center gap-2 self-center">
            <AmountBadge amounts={card.amounts ?? []} plain />
            {card.status && <StatusMark status={card.status} inline />}
            <OffMapMark card={card} />
          </span>
          {card.pinned && (
            <span className="text-accent" title="przypięta">
              ⌖
            </span>
          )}
        </span>
        <CardMetaLine card={card} summary={summary} files={files} />
        {stayUntil && <span className="text-xs text-muted">możesz zostać do {stayUntil}</span>}
        {card.preview && <span className="line-clamp-2 text-sm text-muted">{card.preview}</span>}
      </span>
    </button>
  )
}

/** Wiersz metadanych: godzina i czas, miejsce, domena linku, liczba plików. */
export function CardMetaLine({
  card,
  summary,
  files,
}: {
  card: CardSnapshot
  summary?: string
  files: number
}) {
  const domain = card.linkPreview?.url && hostOf(card.linkPreview.url)
  const parts = [
    summary,
    placeLine(card) && `⌖ ${placeLine(card)}`,
    domain && `↗ ${domain}`,
  ].filter(Boolean)
  if (!parts.length && !files) return null
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-xs text-subtle">
      <span className="truncate">{parts.join(' · ')}</span>
      {files > 0 && (
        <span
          className="flex shrink-0 items-center gap-0.5 text-accent not-italic"
          title={`załączniki: ${files}`}
        >
          <Paperclip className="size-3" aria-hidden="true" />
          {files}
        </span>
      )}
    </span>
  )
}

function hostOf(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return undefined
  }
}

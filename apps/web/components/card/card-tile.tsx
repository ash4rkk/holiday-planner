import { CARD_TYPE_LABELS, type CardSnapshot } from '@planer/core'
import { Paperclip } from 'lucide-react'
import { useRef, useState } from 'react'
import { AmountBadge } from '@/components/amounts'
import { cx } from '@/components/ui'
import { fieldsSummary } from './card-fields'
import { StatusMark } from './status-mark'
import { TYPE_STYLE } from './type-style'
import { VariantBadge } from './variant-badge'

const HOLD_MS = 450
const FRESH_MS = 2500

export function CardTile({
  card,
  files = 0,
  variants = 0,
  stayUntil,
  inDay = false,
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
        'island relative flex w-full gap-3 overflow-hidden py-3 pr-3 pl-4 text-left transition-colors select-none hover:border-sel',
        card.aiDraft && 'border-dashed border-accent',
        fresh && 'pop-in',
      )}
    >
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
          <span className={cx('truncate font-bold', !card.title && 'font-normal text-dim italic')}>
            {card.title || 'bez tytułu'}
          </span>
          <AmountBadge amounts={card.amounts ?? []} className="ml-auto" />
          {card.pinned && (
            <span className="text-accent" title="przypięta">
              ⌖
            </span>
          )}
        </span>
        <CardMetaLine card={card} summary={summary} files={files} />
        {stayUntil && <span className="text-xs text-teal">możesz zostać do {stayUntil}</span>}
        {card.preview && (
          <span className="line-clamp-2 text-[13px] text-muted">{card.preview}</span>
        )}
      </span>
      {card.status && <StatusMark status={card.status} />}
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
    card.location?.name && `⌖ ${card.location.name}`,
    domain && `↗ ${domain}`,
  ].filter(Boolean)
  if (!parts.length && !files) return null
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-xs text-subtle italic">
      <span className="truncate">{parts.join(' · ')}</span>
      {files > 0 && (
        <span
          className="flex shrink-0 items-center gap-0.5 text-teal not-italic"
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

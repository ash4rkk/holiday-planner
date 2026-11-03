import { CARD_STATUS_LABELS, CARD_TYPE_LABELS, type CardSnapshot } from '@planer/core'
import { Paperclip } from 'lucide-react'
import { AmountBadge } from '@/components/amounts'
import { cx } from '@/components/ui'
import { fieldsSummary } from './card-fields'
import { TYPE_STYLE } from './type-style'

export function CardTile({
  card,
  files = 0,
  onOpen,
}: {
  card: CardSnapshot
  /** Liczba załączników karty. */
  files?: number
  onOpen: () => void
}) {
  const style = TYPE_STYLE[card.type]
  const Icon = style.icon
  const summary = fieldsSummary(card)
  const done = card.status === 'done'

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cx(
        'island relative flex w-full gap-3 overflow-hidden py-3 pr-3 pl-4 text-left transition-colors hover:border-sel',
        card.aiDraft && 'border-dashed border-accent',
      )}
    >
      <span className={cx('absolute inset-y-0 left-0 w-1', style.bar)} aria-hidden="true" />
      <span
        className={cx('flex size-9 shrink-0 items-center justify-center rounded-small', style.chip)}
        title={CARD_TYPE_LABELS[card.type]}
      >
        <Icon className="size-4" aria-hidden="true" />
        <span className="sr-only">{CARD_TYPE_LABELS[card.type]}</span>
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-baseline gap-2">
          <span
            className={cx(
              'truncate font-bold',
              !card.title && 'font-normal text-dim italic',
              done && 'text-subtle',
            )}
          >
            {card.title || 'bez tytułu'}
          </span>
          <AmountBadge amounts={card.amounts ?? []} className="ml-auto" />
          {card.pinned && (
            <span className="text-accent" title="przypięta">
              ⌖
            </span>
          )}
          {card.status && (
            <span
              className={cx(
                'ml-auto shrink-0 rounded-small px-2 py-0.5 text-[11px]',
                card.status === 'booked' ? 'bg-green/15 text-green' : 'bg-raised text-subtle',
              )}
            >
              {CARD_STATUS_LABELS[card.status]}
            </span>
          )}
        </span>
        <CardMetaLine card={card} summary={summary} files={files} />
        {card.preview && (
          <span className="line-clamp-2 text-[13px] text-muted">{card.preview}</span>
        )}
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

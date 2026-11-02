import { CARD_STATUS_LABELS, CARD_TYPE_LABELS, type CardSnapshot } from '@planer/core'
import { cx } from '@/components/ui'
import { fieldsSummary } from './card-fields'
import { TYPE_STYLE } from './type-style'

export function CardTile({ card, onOpen }: { card: CardSnapshot; onOpen: () => void }) {
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
        {(summary || card.location?.name) && (
          <span className="truncate text-xs text-subtle italic">
            {[summary, card.location?.name && `⌖ ${card.location.name}`]
              .filter(Boolean)
              .join(' · ')}
          </span>
        )}
        {card.preview && (
          <span className="line-clamp-2 text-[13px] text-muted">{card.preview}</span>
        )}
      </span>
    </button>
  )
}

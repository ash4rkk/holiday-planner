import { CARD_STATUS_LABELS, type CardStatus } from '@planer/core'
import { Check, X } from 'lucide-react'
import { cx } from '@/components/ui'

/** Status karty: „pomysł” słowem, ogarnięte i nieogarnięte jako V i X bez tekstu. */
export function StatusMark({ status, className }: { status: CardStatus; className?: string }) {
  const label = CARD_STATUS_LABELS[status]
  if (status === 'idea')
    return (
      <span
        className={cx(
          'shrink-0 rounded-small bg-raised px-2 py-0.5 text-[11px] text-subtle',
          className,
        )}
      >
        {label}
      </span>
    )
  const Icon = status === 'booked' ? Check : X
  return (
    <span
      title={label}
      className={cx(
        'flex size-5 shrink-0 items-center justify-center rounded-small',
        status === 'booked' ? 'bg-green/15 text-green' : 'bg-red/15 text-red',
        className,
      )}
    >
      <Icon className="size-3.5" strokeWidth={3} aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  )
}

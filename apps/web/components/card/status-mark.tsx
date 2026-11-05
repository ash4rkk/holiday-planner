import { CARD_STATUS_LABELS, type CardStatus } from '@planer/core'
import { CalendarCheck, CalendarClock } from 'lucide-react'
import { cx } from '@/components/ui'

/** Status karty jako duża ikona, wielkości ikony typu; nazwa w podpowiedzi i dla czytników. */
export function StatusMark({ status, className }: { status: CardStatus; className?: string }) {
  const label = CARD_STATUS_LABELS[status]
  const Icon = status === 'booked' ? CalendarCheck : CalendarClock
  return (
    <span
      title={label}
      className={cx(
        'flex size-8 shrink-0 items-center justify-center rounded-small',
        status === 'booked' ? 'bg-green/15 text-green' : 'bg-red/15 text-red',
        className,
      )}
    >
      <Icon className="size-5" strokeWidth={2} aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  )
}

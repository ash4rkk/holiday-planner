import { CARD_STATUS_LABELS, type CardStatus } from '@planer/core'
import { CalendarCheck, CalendarClock } from 'lucide-react'
import { cx } from '@/components/ui'

/**
 * Status karty. Domyślnie duża ikona wielkości ikony typu; `inline` to lekki znak w wierszu tytułu
 * (Lista): „zarezerwowane” samą małą ikoną, „do rezerwacji” z podpisem, bo to jest do zrobienia.
 */
export function StatusMark({
  status,
  className,
  inline,
}: {
  status: CardStatus
  className?: string
  inline?: boolean
}) {
  const label = CARD_STATUS_LABELS[status]
  const Icon = status === 'booked' ? CalendarCheck : CalendarClock
  if (inline)
    return (
      <span
        title={label}
        className={cx(
          'flex shrink-0 items-center gap-1 self-center text-2xs font-bold',
          status === 'booked' ? 'text-green' : 'rounded-small bg-amber/15 px-1.5 py-0.5 text-amber',
          className,
        )}
      >
        <Icon className="size-3.5" strokeWidth={2.2} aria-hidden="true" />
        {status === 'booked' ? <span className="sr-only">{label}</span> : label}
      </span>
    )
  return (
    <span
      title={label}
      className={cx(
        'flex size-8 shrink-0 items-center justify-center rounded-small',
        status === 'booked' ? 'bg-green/15 text-green' : 'bg-amber/15 text-amber',
        className,
      )}
    >
      <Icon className="size-5" strokeWidth={2} aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  )
}

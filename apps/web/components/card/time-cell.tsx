import { arrivalLabel, type CardSnapshot } from '@planer/core'
import { cx } from '@/components/ui'
import { formatDuration } from './type-style'

/** Godzina i czas trwania (transport: przyjazd) w kolumnie obok karty (oś dnia na Liście i Tablicy). */
export function TimeCell({
  card,
  className,
}: {
  card: Pick<CardSnapshot, 'type' | 'date' | 'endDate' | 'time' | 'endTime' | 'durationMin'>
  className?: string
}) {
  return (
    <span className={cx('w-12 shrink-0 text-right leading-tight', className)}>
      <span className="block text-sm font-bold">{card.time}</span>
      {card.type === 'transport' && card.endTime ? (
        <span className="block text-2xs text-subtle" title={`przyjazd ${arrivalLabel(card)}`}>
          → {card.endTime}
          {card.endDate && card.endDate !== card.date && ' +1'}
        </span>
      ) : (
        card.durationMin && (
          <span className="block text-2xs text-subtle">
            {formatDuration(card.durationMin).replace(/ h (\d+) min/, ' h $1')}
          </span>
        )
      )}
    </span>
  )
}

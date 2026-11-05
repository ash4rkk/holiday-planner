import type { CardSnapshot } from '@planer/core'
import { Layers } from 'lucide-react'
import { cx } from '@/components/ui'

/** Znacznik wariantów: ikona i liczba opcji; przed wyborem w kolorze akcentu, po wyborze wyciszony. */
export function VariantBadge({
  card,
  count,
  className,
}: {
  card: Pick<CardSnapshot, 'variantChosen'>
  /** Liczba wariantów bez karty głównej. */
  count: number
  className?: string
}) {
  const label = card.variantChosen ? `wybrano, wariantów: ${count}` : `do wyboru: ${count + 1}`
  return (
    <span
      title={label}
      className={cx(
        'inline-flex shrink-0 items-center gap-1 text-xs',
        card.variantChosen ? 'text-subtle' : 'text-accent',
        className,
      )}
    >
      <Layers className="size-3.5" aria-hidden="true" />
      {count + 1}
      <span className="sr-only">{label}</span>
    </span>
  )
}

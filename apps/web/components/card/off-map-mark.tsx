import { type CardSnapshot, type OffMapReason, offMapReason } from '@planer/core'
import { MapPinX } from 'lucide-react'
import { cx } from '@/components/ui'

const LABELS: Record<OffMapReason, string> = {
  address: 'poza mapą: adres bez współrzędnych',
  link: 'poza mapą: link bez współrzędnych',
  name: 'poza mapą: tylko nazwa',
  none: 'poza mapą: bez miejsca',
}

/**
 * Znak karty, która powinna mieć pinezkę na Mapie, a jej nie ma. Bursztyn („do uzupełnienia”) dla
 * kart z dniem; pomysł dostaje cichą, szarą wersję. Powód w podpowiedzi; uzupełnia się w karcie.
 */
export function OffMapMark({ card, className }: { card: CardSnapshot; className?: string }) {
  const reason = offMapReason(card)
  if (!reason) return null
  const planned = Boolean(card.date || card.variantOf)
  return (
    <span
      title={LABELS[reason]}
      className={cx(
        'flex size-5 shrink-0 items-center justify-center rounded-small',
        planned ? 'bg-amber/15 text-amber' : 'text-subtle',
        className,
      )}
    >
      <MapPinX className="size-3.5" strokeWidth={2.2} aria-hidden="true" />
      <span className="sr-only">{LABELS[reason]}</span>
    </span>
  )
}

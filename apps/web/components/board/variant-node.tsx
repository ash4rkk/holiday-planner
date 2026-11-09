'use client'

import type { CardSnapshot } from '@planer/core'
import type { Node, NodeProps } from '@xyflow/react'
import { memo } from 'react'
import { cx } from '@/components/ui'
import { useBoard } from './board-context'
import { CardFace } from './card-face'

export type VariantNodeType = Node<{ card: CardSnapshot; files: number; dim: boolean }, 'variant'>

/**
 * Wariant obok karty głównej, w pełnym rozmiarze. Po wyborze przyciemniony. Pozycja liczona przy
 * rysowaniu, nigdy zapisywana w dokumencie: telefon pokazuje ten sam wariant w stosie.
 */
export const VariantNode = memo(function VariantNode({
  data: { card, files, dim },
}: NodeProps<VariantNodeType>) {
  const board = useBoard()
  return (
    <div
      className={cx(
        'nopan nodrag pointer-events-auto relative size-full overflow-hidden rounded-island border border-dashed border-line bg-panel transition-opacity',
        dim && 'opacity-55 hover:opacity-100',
      )}
    >
      <button
        type="button"
        onClick={() => board.openCard(card.id)}
        className="flex size-full flex-col gap-1 py-2 pr-3 pl-4 text-left"
      >
        <CardFace card={card} files={files} footerSpace />
      </button>
      <ChooseButton onClick={() => board.chooseVariant(card.id)} />
    </div>
  )
})

/** „wybierz” w rogu karty rozgałęzienia. */
export function ChooseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute right-1 bottom-1 min-h-11 rounded-small bg-panel px-2 text-xs font-bold text-accent"
    >
      wybierz
    </button>
  )
}

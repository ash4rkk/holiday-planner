'use client'

import type { CardSnapshot } from '@planer/core'
import type { Node, NodeProps } from '@xyflow/react'
import { BedDouble } from 'lucide-react'
import { memo } from 'react'
import { cx } from '@/components/ui'
import { useBoard } from './board-context'

export type StayNodeType = Node<
  {
    card: CardSnapshot
    nights: number
    /** Nakłada się z innym noclegiem (drugi rząd). */
    clash: boolean
    /** Belka zaczyna się przed pierwszym narysowanym dniem albo kończy za ostatnim. */
    cutStart: boolean
    cutEnd: boolean
  },
  'stay'
>

const nightsLabel = (n: number) => (n === 1 ? '1 noc' : n < 5 ? `${n} noce` : `${n} nocy`)

/**
 * Nocleg jako belka nad dniami, które obejmuje: nazwa, liczba nocy i godzina zameldowania. Dotknięcie
 * otwiera kartę noclegu; prawy klik i przytrzymanie — jej menu.
 */
export const StayNode = memo(function StayNode({ data }: NodeProps<StayNodeType>) {
  const board = useBoard()
  const { card, nights, clash, cutStart, cutEnd } = data
  return (
    <button
      type="button"
      onClick={() => board.openCard(card.id)}
      onContextMenu={(e) => {
        e.preventDefault()
        board.openMenu(card.id, e.clientX, e.clientY)
      }}
      aria-label={`nocleg ${card.title || card.location?.name || ''}, ${nightsLabel(nights)}`}
      className={cx(
        'nopan nodrag pointer-events-auto flex size-full items-center gap-2 overflow-hidden border bg-plum/15 px-3 text-left text-sm text-plum transition-colors hover:bg-plum/25',
        clash ? 'border-red' : 'border-plum/60',
        cutStart ? 'rounded-l-none border-l-0' : 'rounded-l-island',
        cutEnd ? 'rounded-r-none border-r-0' : 'rounded-r-island',
        card.skipped && 'line-through opacity-50',
      )}
    >
      <BedDouble className="size-4 shrink-0" aria-hidden="true" />
      <span className="truncate font-bold">{card.title || card.location?.name || 'nocleg'}</span>
      <span className="shrink-0 text-xs text-plum/80">
        · {nightsLabel(nights)}
        {card.time && ` · od ${card.time}`}
      </span>
      {clash && <span className="ml-auto shrink-0 text-xs text-red">● nakłada się</span>}
    </button>
  )
})

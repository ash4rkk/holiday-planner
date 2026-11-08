import type { Node, NodeProps } from '@xyflow/react'
import { memo } from 'react'
import { cx } from '@/components/ui'

export type NowNodeType = Node<{ time: string }, 'now'>

/** Linia aktualnego czasu w kolumnie dnia; nie łapie gestów. */
export const NowNode = memo(function NowNode({ data, width }: NodeProps<NowNodeType>) {
  return (
    <div className="pointer-events-none flex items-center gap-1" style={{ width }}>
      <span className="h-0.5 flex-1 rounded-full bg-accent" />
      <span className="rounded-small bg-accent px-1.5 py-0.5 text-2xs font-bold text-on-accent">
        teraz {data.time}
      </span>
    </div>
  )
})

export type DropNodeType = Node<{ label: string; warn?: boolean }, 'drop'>

/** Miejsce w dniu pod przeciąganą kartą, z podpowiedzianą godziną. */
export const DropNode = memo(function DropNode({ data, width }: NodeProps<DropNodeType>) {
  return (
    <div className="pointer-events-none flex items-center gap-1" style={{ width }}>
      <span className={cx('h-0.5 flex-1 rounded-full', data.warn ? 'bg-red' : 'bg-accent')} />
      <span
        className={cx(
          'rounded-small border bg-panel px-1.5 py-0.5 text-2xs font-bold whitespace-nowrap',
          data.warn ? 'border-red text-red' : 'border-accent text-accent',
        )}
      >
        {data.label}
      </span>
    </div>
  )
})

export type SlotNodeType = Node<{ label: string; day: boolean; active: boolean }, 'slot'>

/**
 * Podczas przeciągania: miejsce w dniu („+ 11:10” między kartami i za ostatnią) albo pusty dzień
 * i „+ nowy dzień” jako przerywana ramka.
 */
export const SlotNode = memo(function SlotNode({ data, width, height }: NodeProps<SlotNodeType>) {
  if (data.day)
    return (
      <div
        className={cx(
          'pointer-events-none flex items-center justify-center rounded-island border-2 border-dashed text-sm',
          data.active ? 'border-accent bg-active text-accent' : 'border-line text-subtle',
        )}
        style={{ width, height }}
      >
        {data.label}
      </div>
    )
  return (
    <div className="pointer-events-none flex items-center justify-center gap-1" style={{ width }}>
      <span className="h-px flex-1 border-t border-dashed border-line" />
      <span className="rounded-full border border-dashed border-line bg-bg px-2 text-2xs text-subtle">
        {data.label}
      </span>
      <span className="h-px flex-1 border-t border-dashed border-line" />
    </div>
  )
})

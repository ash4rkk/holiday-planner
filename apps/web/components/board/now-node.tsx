import type { Node, NodeProps } from '@xyflow/react'
import { memo } from 'react'

export type NowNodeType = Node<{ time: string }, 'now'>

/** Linia aktualnego czasu w kolumnie dnia; nie łapie gestów. */
export const NowNode = memo(function NowNode({ data, width }: NodeProps<NowNodeType>) {
  return (
    <div className="pointer-events-none flex items-center gap-1" style={{ width }}>
      <span className="h-0.5 flex-1 rounded-full bg-accent" />
      <span className="rounded-small bg-accent px-1.5 py-0.5 text-[10px] font-bold text-on-accent">
        teraz {data.time}
      </span>
    </div>
  )
})

export type DropNodeType = Node<{ label: string }, 'drop'>

/** Miejsce w dniu pod przeciąganą kartą, z podpowiedzianą godziną. */
export const DropNode = memo(function DropNode({ data, width }: NodeProps<DropNodeType>) {
  return (
    <div className="pointer-events-none flex items-center gap-1" style={{ width }}>
      <span className="h-0.5 flex-1 rounded-full bg-accent" />
      <span className="rounded-small border border-accent bg-panel px-1.5 py-0.5 text-[10px] font-bold whitespace-nowrap text-accent">
        {data.label}
      </span>
    </div>
  )
})

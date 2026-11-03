'use client'

import type { Node, NodeProps } from '@xyflow/react'
import { memo, useMemo } from 'react'
import { seedOf, sketchRoundRect } from './sketch'

export type DayNodeType = Node<{ date: string; label: string; sub?: string }, 'day'>

/**
 * Obrys dnia: przerywana szkicowa ramka wokół kart z tą samą datą. Liczona z kart, nie zapisana
 * w dokumencie — idzie za kartami przy przeciąganiu i zmianie daty. Nie łapie gestów.
 */
export const DayNode = memo(function DayNode({ data, width, height }: NodeProps<DayNodeType>) {
  const w = width ?? 0
  const h = height ?? 0
  const paths = useMemo(() => sketchRoundRect(w, h, seedOf(data.date)), [w, h, data.date])

  return (
    <>
      <svg
        width={w}
        height={h}
        className="pointer-events-none absolute inset-0 overflow-visible"
        aria-hidden="true"
      >
        <rect
          x={3}
          y={3}
          width={Math.max(0, w - 6)}
          height={Math.max(0, h - 6)}
          rx={28}
          className="fill-teal/5"
        />
        {paths.map((d) => (
          <path
            key={d.slice(0, 24)}
            d={d}
            fill="none"
            strokeWidth={1.8}
            strokeDasharray="10 9"
            strokeLinecap="round"
            className="stroke-teal/70"
          />
        ))}
      </svg>
      <div className="pointer-events-none absolute top-0 left-6 flex -translate-y-1/2 items-baseline gap-2 rounded-small border border-line bg-panel px-3 py-1.5">
        <span className="font-bold text-sm text-teal">{data.label}</span>
        {data.sub && <span className="text-xs text-subtle italic">{data.sub}</span>}
      </div>
    </>
  )
})

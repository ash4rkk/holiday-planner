'use client'

import type { Node, NodeProps } from '@xyflow/react'
import { memo, useMemo } from 'react'
import { cx } from '@/components/ui'
import { DayWeather } from '@/components/weather'
import { useCards } from '@/lib/yjs/trip-doc'
import { seedOf, sketchLine, sketchRoundRect } from './sketch'

export type DayNodeType = Node<
  { date: string; label: string; sub?: string; today?: boolean },
  'day'
>

/**
 * Dzień jako ołówkowa ramka wokół kart z tą samą datą, z nagłówkiem w środku. Ziarno z daty: kreska
 * nie drga przy przeciąganiu. Liczona z kart, nie zapisana w dokumencie. Nie łapie gestów.
 */
export const DayNode = memo(function DayNode({ data, width, height }: NodeProps<DayNodeType>) {
  const w = width ?? 0
  const h = height ?? 0
  const cards = useCards()
  const seed = seedOf(data.date)
  const frame = useMemo(() => sketchRoundRect(w, h, seed), [w, h, seed])
  const underline = useMemo(() => sketchLine(0, 3, 120, 3, seed), [seed])
  const stroke = data.today ? 'stroke-accent' : 'stroke-subtle'

  return (
    <>
      <svg
        width={w}
        height={h}
        className="pointer-events-none absolute inset-0 overflow-visible"
        aria-hidden="true"
      >
        {frame.map((d) => (
          <path
            key={d.slice(0, 24)}
            d={d}
            fill="none"
            strokeWidth={1.3}
            strokeLinecap="round"
            className={stroke}
          />
        ))}
      </svg>
      <div className="pointer-events-none relative flex h-10 items-center gap-2 px-4">
        <span
          className={cx('relative text-sm font-bold', data.today ? 'text-accent' : 'text-text')}
        >
          {data.label}
          <svg
            viewBox="0 0 120 6"
            preserveAspectRatio="none"
            className="absolute inset-x-0 -bottom-1.5 h-1.5 w-full overflow-visible"
            aria-hidden="true"
          >
            {underline.map((d) => (
              <path
                key={d.slice(0, 24)}
                d={d}
                fill="none"
                strokeWidth={1.4}
                vectorEffect="non-scaling-stroke"
                className="stroke-accent"
              />
            ))}
          </svg>
        </span>
        {data.sub && <span className="text-xs text-subtle italic">{data.sub}</span>}
        <DayWeather date={data.date} cards={cards} className="ml-auto" />
      </div>
    </>
  )
})

import { type DayGap, transitUrl } from '@planer/core'
import type { TravelCheck } from '@/lib/use-day-travel'

/** Wiersz między kartami dnia: nakładanie się, wynik sprawdzenia dojazdu, link do trasy. */
export function DayGapRow({ gap, check }: { gap: DayGap; check?: TravelCheck | null }) {
  const overlap = gap.freeMin < 0
  if (!overlap && !gap.route) return null
  return (
    <p className="flex min-h-7 flex-wrap items-center gap-x-2 px-2 text-xs">
      {overlap && <span className="text-red">● nakłada się o {-gap.freeMin} min</span>}
      {check && (
        <span className={check.late > 0 ? 'text-red' : 'text-green'}>
          {check.late > 0 ? '●' : '•'} {check.minutes} min {check.mode}, masz {gap.freeMin}
          {check.late > 0 ? ` · brakuje ${check.late}` : ''}
        </span>
      )}
      {gap.route && (
        <a
          href={transitUrl(gap.route.from, gap.route.to)}
          target="_blank"
          rel="noreferrer"
          className="ml-auto flex min-h-7 items-center text-subtle italic hover:text-accent"
        >
          dojazd ›
        </a>
      )}
    </p>
  )
}

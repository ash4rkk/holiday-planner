'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { NAV_ISLAND } from '@/components/nav/bottom-nav'
import { cx } from '@/components/ui'

const weekdayShort = new Intl.DateTimeFormat('pl-PL', { weekday: 'short', timeZone: 'UTC' })
const dayMonthShort = new Intl.DateTimeFormat('pl-PL', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})
/** „śr 11 lis” — dzień w przełączniku dni. */
export function dayLabel(date: string): string {
  const at = new Date(`${date}T12:00:00Z`)
  return `${weekdayShort.format(at).replace('.', '')} ${dayMonthShort.format(at)}`
}

/**
 * Przełącznik dni nad menu dolnym (Tablica, Mapa): ‹ data › w wysepce jak menu. Pod datą miejsce
 * w kolejności („4 z 5”); dotknięcie daty skacze do dziś. Końce przygaszone.
 */
export function DaySwitcher({
  label,
  sub,
  isToday,
  onPrev,
  onNext,
  canPrev,
  canNext,
  onLabel,
  labelAria,
  className,
  style,
}: {
  label: string
  sub?: string
  isToday?: boolean
  onPrev: () => void
  onNext: () => void
  canPrev: boolean
  canNext: boolean
  onLabel?: () => void
  labelAria?: string
  className?: string
  style?: React.CSSProperties
}) {
  const arrow =
    'flex size-10 items-center justify-center rounded-full text-muted hover:text-accent disabled:text-sel'
  return (
    <div className={cx(NAV_ISLAND, className)} style={style}>
      <button
        type="button"
        onClick={onPrev}
        disabled={!canPrev}
        aria-label="poprzedni dzień"
        className={arrow}
      >
        <ChevronLeft className="size-5" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={onLabel}
        aria-label={labelAria}
        className="flex min-w-16 flex-col items-center px-1 leading-tight"
      >
        <span
          className={cx(
            'text-xs font-bold whitespace-nowrap',
            isToday ? 'text-accent' : 'text-text',
          )}
        >
          {label}
        </span>
        {sub && <span className="text-2xs whitespace-nowrap text-subtle">{sub}</span>}
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={!canNext}
        aria-label="następny dzień"
        className={arrow}
      >
        <ChevronRight className="size-5" aria-hidden="true" />
      </button>
    </div>
  )
}

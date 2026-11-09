import { cx } from '@/components/ui'

const minutesOf = (hhmm: string) => {
  const [h = 0, m = 0] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/** Minuty od `now` do `target` (oba „HH:MM” tego samego dnia); ujemne = już minęło. */
export function minutesUntil(now: string, target: string): number {
  return minutesOf(target) - minutesOf(now)
}

function formatLeft(min: number): string {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`
}

/** Pełny pierścień = 2 h i więcej; zamyka się do chwili wyjścia. */
const WINDOW_MIN = 120
const R = 44
const LENGTH = 2 * Math.PI * R

/**
 * Odliczanie do wyjścia (albo do startu, gdy nie znamy dojazdu). Przy `left ≤ 0` pierścień jest
 * pełny w kolorze akcentu i mówi „czas wyjść”.
 */
export function CountdownRing({
  now,
  leaveBy,
  startsAt,
}: {
  now: string
  leaveBy?: string
  startsAt?: string
}) {
  const target = leaveBy ?? startsAt
  if (!target) return null
  const left = minutesUntil(now, target)
  const late = left <= 0
  const fraction = late ? 1 : Math.min(left, WINDOW_MIN) / WINDOW_MIN
  const label = late ? (leaveBy ? 'czas wyjść' : 'już trwa') : leaveBy ? 'wyjdź za' : 'start za'

  return (
    <div
      className="relative size-32"
      role="timer"
      aria-label={`${label} ${late ? '' : formatLeft(left)}`}
    >
      <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden="true">
        <circle cx="50" cy="50" r={R} fill="none" strokeWidth="6" className="stroke-raised" />
        <circle
          cx="50"
          cy="50"
          r={R}
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={LENGTH}
          strokeDashoffset={LENGTH * (1 - fraction)}
          className={cx('stroke-accent transition-[stroke-dashoffset] duration-700')}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-xs text-subtle">{label}</span>
        {!late && <span className="text-2xl leading-tight font-bold">{formatLeft(left)}</span>}
        <span className="text-xs text-accent">{leaveBy ? `do ${leaveBy}` : startsAt}</span>
      </div>
    </div>
  )
}

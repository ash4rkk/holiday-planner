'use client'

import {
  type DayGap,
  type LegPlan,
  type LegStep,
  legShortfall,
  shiftClock,
  TRAVEL_MODE_LABELS,
  transitUrl,
} from '@planer/core'
import { ChevronDown, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import type { PlanResponse } from '@/app/api/route/plan/route'
import { cx } from '@/components/ui'
import { useTrip } from '@/lib/yjs/trip-doc'
import { formatDuration } from './type-style'

const LABELS: Record<DayGap['kind'], string | undefined> = {
  start: 'z noclegu',
  between: undefined,
  end: 'powrót do noclegu',
}

function stepText(s: LegStep): string {
  if (s.kind === 'walk') return `pieszo ${s.minutes} min`
  const ride = [s.vehicle, s.line].filter(Boolean).join(' ')
  const stops = s.stops ? ` · ${s.stops} przyst.` : ''
  return `${ride}${s.departs ? ` o ${s.departs}` : ''}: ${s.from ?? ''} → ${s.to ?? ''}${stops}`
}

function checkedText(iso: string): string {
  return new Intl.DateTimeFormat('pl-PL', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

/** Odcinek między kartami: czy zdążycie, kiedy wyjść, po rozwinięciu linie i przesiadki. */
export function LegRow({
  leg,
  date,
  plan: base,
  bufferMin,
  onRefresh,
}: {
  leg: DayGap
  date: string
  plan?: LegPlan | null
  bufferMin: number
  onRefresh?: () => void
}) {
  const { trip } = useTrip()
  const [open, setOpen] = useState(false)
  // Wybrane inne połączenie; zostaje do wyjścia z ekranu, plan dnia się nie zmienia.
  const [other, setOther] = useState<LegPlan | null>(null)
  const [searching, setSearching] = useState(false)
  const plan = other ?? base

  const shift = async (direction: 'earlier' | 'later') => {
    const first = plan?.steps.find((s) => s.kind === 'transit')
    if (!leg.route || !first?.departs) return
    setSearching(true)
    const res = await fetch('/api/route/plan', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tripId: trip.id,
        date,
        ride: true,
        legs: [
          {
            id: leg.id,
            ...leg.route,
            ...(direction === 'later'
              ? { leaveAt: shiftClock(first.departs, 1) }
              : { arriveBy: shiftClock(first.departs, first.minutes - 1) }),
          },
        ],
      }),
    }).catch(() => null)
    const body = res?.ok ? ((await res.json()) as PlanResponse) : null
    setSearching(false)
    const found = body?.plans[leg.id]
    if (found) setOther(found)
  }
  const overlap = leg.freeMin !== undefined && leg.freeMin < 0
  if (!overlap && !leg.route) return null

  const short = plan ? legShortfall(leg, plan, bufferMin) : undefined
  const late = short !== undefined && short > 0
  const leaveBy =
    plan && leg.arriveBy
      ? shiftClock(plan.departAt ?? shiftClock(leg.arriveBy, -plan.minutes), -bufferMin)
      : undefined
  const label = LABELS[leg.kind]
  const details = plan && (plan.steps.length > 0 || onRefresh)

  return (
    <div className="px-2 text-xs">
      <div className="flex min-h-7 flex-wrap items-center gap-x-2">
        {overlap && (
          <span className="text-red">● nakłada się o {-(leg.freeMin as number)} min</span>
        )}
        {plan && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            disabled={!details}
            className={cx(
              'flex min-h-7 items-center gap-1 text-left',
              late || plan.noService ? 'text-red' : 'text-green',
            )}
          >
            <span>
              {late || plan.noService ? '●' : '•'} {label && `${label}: `}
              {plan.noService && 'już nic nie jedzie, '}
              {plan.minutes} min {TRAVEL_MODE_LABELS[plan.mode]}
              {leaveBy && !overlap && ` · wyjdź do ${leaveBy}`}
              {late && ` · brakuje ${short} min`}
            </span>
            {details && (
              <ChevronDown
                className={cx('size-3 shrink-0 transition-transform', open && 'rotate-180')}
                aria-hidden="true"
              />
            )}
          </button>
        )}
        {leg.route && (
          <a
            href={transitUrl(leg.route.from, leg.route.to)}
            target="_blank"
            rel="noreferrer"
            className="ml-auto flex min-h-7 items-center text-subtle italic hover:text-accent"
          >
            dojazd ›
          </a>
        )}
      </div>
      {open && plan && (
        <div className="fade-in flex flex-col gap-0.5 pb-1 pl-3 text-subtle">
          {plan.steps.map((s, i) => (
            <span key={i}>{stepText(s)}</span>
          ))}
          {plan.mode === 'transit' && (
            <span className="flex items-center gap-3">
              <button
                type="button"
                disabled={searching}
                onClick={() => void shift('earlier')}
                className="min-h-9 text-accent disabled:opacity-50"
              >
                ‹ wcześniejsze
              </button>
              <button
                type="button"
                disabled={searching}
                onClick={() => void shift('later')}
                className="min-h-9 text-accent disabled:opacity-50"
              >
                późniejsze ›
              </button>
              {other && (
                <button
                  type="button"
                  onClick={() => setOther(null)}
                  className="min-h-9 text-subtle italic"
                >
                  wróć do planu
                </button>
              )}
            </span>
          )}
          <span className="flex items-center gap-2 text-dim italic">
            sprawdzono {checkedText(plan.checkedAt)}
            {plan.mode === 'transit' && (
              <span className="font-sans text-attrib not-italic">Google Maps</span>
            )}
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                aria-label="sprawdź ponownie"
                className="flex size-7 items-center justify-center hover:text-accent"
              >
                <RefreshCw className="size-3" aria-hidden="true" />
              </button>
            )}
          </span>
        </div>
      )}
    </div>
  )
}

/** „W drodze około 1 h 20 min · 6 km” — suma odcinków dnia. */
export function DayTravelSummary({
  plans,
  limited,
}: {
  plans: Record<string, LegPlan | null>
  limited: boolean
}) {
  const list = Object.values(plans).filter((p) => !!p)
  if (!list.length && !limited) return null
  const minutes = list.reduce((sum, p) => sum + p.minutes, 0)
  const km = list.reduce((sum, p) => sum + (p.km ?? 0), 0)
  return (
    <p className="px-3 text-xs text-subtle italic">
      {list.length > 0 &&
        `w drodze około ${formatDuration(minutes)}${km ? ` · ${String(Math.round(km * 10) / 10).replace('.', ',')} km` : ''}`}
      {limited && (
        <span className="text-red not-italic"> ● limit dojazdów wyczerpany, czasy pieszo</span>
      )}
    </p>
  )
}

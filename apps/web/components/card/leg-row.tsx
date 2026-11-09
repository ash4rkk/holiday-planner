'use client'

import {
  type DayGap,
  formatAmount,
  type LegPlan,
  type LegStep,
  legShortfall,
  shiftClock,
  sumByCurrency,
  TRAVEL_MODE_LABELS,
  type TravelMode,
  transitUrl,
  updateCard,
} from '@planer/core'
import { ChevronDown, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import type { PlanResponse } from '@/app/api/route/plan/route'
import { cx } from '@/components/ui'
import { withUndo } from '@/lib/undo'
import { useTrip } from '@/lib/yjs/trip-doc'
import { formatDuration } from './type-style'

const MODES: TravelMode[] = ['transit', 'walk', 'drive']

/** Zapytanie o inne połączenie: od chwili wyjścia, nie od odjazdu (inaczej przeskakuje kursy). */
export function shiftRequest(
  plan: Pick<LegPlan, 'departAt' | 'minutes' | 'steps'>,
  direction: 'earlier' | 'later',
): { leaveAt: string } | { arriveBy: string } | undefined {
  const first = plan.steps.find((s) => s.kind === 'transit')
  const leave = plan.departAt ?? first?.departs
  if (!leave) return undefined
  return direction === 'later'
    ? { leaveAt: shiftClock(leave, 1) }
    : { arriveBy: shiftClock(leave, plan.minutes - 1) }
}

/** „bilet ok. 3,10 € / os.” */
export function fareText(fare: NonNullable<LegPlan['fare']>): string {
  return `bilet ok. ${formatAmount({ value: fare.amount, currency: fare.currency })} / os.`
}

const LABELS: Record<DayGap['kind'], string | undefined> = {
  start: 'z noclegu',
  between: undefined,
  end: 'powrót do noclegu',
}

type TimelineRow = {
  time?: string
  kind: 'walk' | 'transit' | 'end'
  title: string
  detail?: string
  line?: string
}

/**
 * Kroki dojazdu jako oś: każdy krok z godziną (wyjście, odjazd, wysiadka, na miejscu). Godziny
 * odjazdów z rozkładu; odcinki piesze liczone od wyjścia albo od wysiadki.
 */
export function timeline(steps: LegStep[], start?: string): TimelineRow[] {
  const rows: TimelineRow[] = []
  let at = start
  let place = 'wyjście'
  for (const s of steps) {
    if (s.kind === 'walk') {
      rows.push({ time: at, kind: 'walk', title: place, detail: `pieszo ${s.minutes} min` })
      if (at) at = shiftClock(at, s.minutes)
      place = 'na miejscu'
    } else {
      const ride = [s.vehicle, s.stops && `${s.stops} przyst.`, `${s.minutes} min`]
      rows.push({
        time: s.departs ?? at,
        kind: 'transit',
        title: s.from ?? 'przystanek',
        detail: [...ride, s.headsign && `kierunek ${s.headsign}`].filter(Boolean).join(' · '),
        line: s.line ?? s.vehicle,
      })
      const from = s.departs ?? at
      at = from ? shiftClock(from, s.minutes) : undefined
      place = s.to ?? 'przystanek'
    }
  }
  rows.push({ time: at, kind: 'end', title: place === 'wyjście' ? 'na miejscu' : place })
  // Ostatni pieszy odcinek kończy się „na miejscu” — bez powtórzenia nazwy przystanku.
  const last = rows.at(-1)
  if (last && rows.at(-2)?.kind === 'walk') last.title = 'na miejscu'
  return rows
}

/** Pionowa oś dojazdu (J1): godzina, znacznik i linia odcinka, opis kroku. */
function StepTimeline({ rows }: { rows: TimelineRow[] }) {
  return (
    <ol className="grid grid-cols-[2.75rem_0.875rem_1fr] gap-x-2 py-1">
      {rows.map((r, i) => {
        const next = rows[i + 1]
        return (
          <li key={i} className="contents">
            <span
              className={cx(
                'pt-px text-right tabular-nums',
                i === 0 ? 'font-bold text-accent' : r.kind === 'end' ? 'text-muted' : 'text-text',
              )}
            >
              {r.time ?? ''}
            </span>
            <span className="flex flex-col items-center" aria-hidden="true">
              <span
                className={cx(
                  'mt-1 shrink-0',
                  r.kind === 'transit'
                    ? 'size-2.5 rounded-full bg-blue'
                    : r.kind === 'end'
                      ? 'size-2.5 rounded-[3px] bg-green'
                      : 'size-2.5 rounded-full border-2 border-muted',
                )}
              />
              {next && (
                <span
                  className={cx(
                    'my-0.5 min-h-4 flex-1',
                    r.kind === 'transit'
                      ? 'border-l-[3px] border-blue'
                      : 'border-l-2 border-dotted border-subtle',
                  )}
                />
              )}
            </span>
            <span className={cx('min-w-0', next && 'pb-2')}>
              <span className="flex items-center gap-1.5 text-text">
                {r.line && (
                  <span className="rounded-small bg-blue px-1.5 text-2xs font-bold text-bg">
                    {r.line}
                  </span>
                )}
                <span className="truncate">{r.title}</span>
              </span>
              {r.detail && <span className="block text-subtle">{r.detail}</span>}
            </span>
          </li>
        )
      })}
    </ol>
  )
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
  early,
}: {
  leg: DayGap
  date: string
  plan?: LegPlan | null
  bufferMin: number
  onRefresh?: () => void
  /** Google nie ma jeszcze rozkładu na ten dzień. */
  early?: boolean
}) {
  const { trip, doc } = useTrip()
  const [open, setOpen] = useState(false)
  // Wybrane inne połączenie; zostaje do wyjścia z ekranu, plan dnia się nie zmienia.
  const [other, setOther] = useState<LegPlan | null>(null)
  const [searching, setSearching] = useState(false)
  const plan = other ?? base

  const mode = leg.mode ?? trip.travelMode
  const setMode = (next: TravelMode) => {
    const cardId = leg.modeCardId
    if (!cardId || next === mode) return
    setOther(null)
    withUndo(doc, `dojazd ${TRAVEL_MODE_LABELS[next]}`, () =>
      updateCard(doc, cardId, { arriveMode: next === trip.travelMode ? undefined : next }),
    )
  }

  const shift = async (direction: 'earlier' | 'later') => {
    const when = plan && shiftRequest(plan, direction)
    if (!leg.route || !when) return
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
            mode: leg.mode,
            ...when,
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
  if (!overlap && !leg.route && !leg.far) return null

  const short = plan ? legShortfall(leg, plan, bufferMin) : undefined
  const late = short !== undefined && short > 0
  const leaveBy =
    plan && leg.arriveBy
      ? shiftClock(plan.departAt ?? shiftClock(leg.arriveBy, -plan.minutes), -bufferMin)
      : undefined
  const label = LABELS[leg.kind]
  // Rozwinięcie zawsze, gdy jest trasa: tam też wybór, czym jechać (np. auto przy braku połączenia).
  const details = Boolean(leg.route && (plan !== undefined || early))

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
              'hit flex min-h-7 items-center gap-1 text-left',
              late || plan.noService ? 'text-red' : 'text-green',
            )}
          >
            <span>
              {(late || plan.noService) && '● '}
              {label && `${label}: `}
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
        {leg.far && (
          <span className="text-subtle">
            {label && `${label}: `}za daleko na dojazd · dodaj kartę transportu
          </span>
        )}
        {plan === null && leg.route && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className={cx(
              'hit flex min-h-7 items-center gap-1 text-left',
              early ? 'text-subtle' : 'text-amber',
            )}
          >
            <span>
              {!early && '● '}
              {label && `${label}: `}
              {early ? 'rozkładu jeszcze nie ma, sprawdzimy bliżej wyjazdu' : 'brak połączenia'}
            </span>
            <ChevronDown
              className={cx('size-3 shrink-0 transition-transform', open && 'rotate-180')}
              aria-hidden="true"
            />
          </button>
        )}
        {leg.route && (
          <a
            href={transitUrl(leg.route.from, leg.route.to)}
            target="_blank"
            rel="noreferrer"
            className="hit ml-auto flex min-h-7 items-center text-subtle hover:text-accent"
          >
            dojazd ›
          </a>
        )}
      </div>
      {open && details && (
        <div className="fade-in flex flex-col gap-0.5 pb-1 pl-1 text-subtle">
          {leg.modeCardId && (
            <span className="flex flex-wrap items-center gap-1.5" role="group" aria-label="czym">
              <span className="text-subtle">czym</span>
              {MODES.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  aria-pressed={m === mode}
                  className={cx(
                    'flex min-h-11 items-center rounded-full border px-3',
                    m === mode
                      ? 'border-accent bg-active font-bold text-accent'
                      : 'border-line text-muted hover:text-accent',
                  )}
                >
                  {m === 'drive' ? 'autem / taxi' : TRAVEL_MODE_LABELS[m]}
                </button>
              ))}
            </span>
          )}
          {leg.earlyMin !== undefined && (
            <span>na miejscu {formatDuration(leg.earlyMin)} przed godziną karty</span>
          )}
        </div>
      )}
      {open && plan && (
        <div className="fade-in flex flex-col gap-0.5 pb-1 pl-1 text-subtle">
          {plan.fare && <span>{fareText(plan.fare)}</span>}
          {plan.steps.length > 0 && (
            <StepTimeline rows={timeline(plan.steps, leaveBy ?? plan.departAt)} />
          )}
          {plan.mode === 'transit' && (
            <span className="flex flex-wrap items-center gap-1.5">
              <span className="text-subtle">odjazd</span>
              <button
                type="button"
                disabled={searching}
                onClick={() => void shift('earlier')}
                aria-label="wcześniejsze połączenie"
                className="flex min-h-11 items-center rounded-full border border-line px-3 text-muted hover:text-accent disabled:opacity-50"
              >
                ‹ wcześniej
              </button>
              {plan.steps.find((s) => s.kind === 'transit')?.departs && (
                <span className="flex min-h-11 items-center rounded-full border border-accent bg-active px-3 font-bold text-accent">
                  {plan.steps.find((s) => s.kind === 'transit')?.departs}
                </span>
              )}
              <button
                type="button"
                disabled={searching}
                onClick={() => void shift('later')}
                aria-label="późniejsze połączenie"
                className="flex min-h-11 items-center rounded-full border border-line px-3 text-muted hover:text-accent disabled:opacity-50"
              >
                później ›
              </button>
              {other && (
                <button
                  type="button"
                  onClick={() => setOther(null)}
                  className="min-h-11 px-1 text-subtle hover:text-accent"
                >
                  wróć do planu
                </button>
              )}
            </span>
          )}
          <span className="flex items-center gap-2 text-subtle">
            sprawdzono {checkedText(plan.checkedAt)}
            {plan.mode === 'transit' && (
              <span className="font-sans text-attrib not-italic">Google Maps</span>
            )}
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                aria-label="sprawdź ponownie"
                className="hit flex size-7 items-center justify-center hover:text-accent"
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
  // Jeden odcinek tylko powtórzyłby wiersz nad podsumowaniem.
  const summary = list.length > 1
  if (!summary && !limited) return null
  const minutes = list.reduce((sum, p) => sum + p.minutes, 0)
  const km = list.reduce((sum, p) => sum + (p.km ?? 0), 0)
  const fares = sumByCurrency(
    list.flatMap((p) => (p.fare ? [{ value: p.fare.amount, currency: p.fare.currency }] : [])),
  )
  return (
    <p className="px-3 text-xs text-subtle">
      {summary &&
        `w drodze około ${formatDuration(minutes)}${km ? ` · ${String(Math.round(km * 10) / 10).replace('.', ',')} km` : ''}`}
      {summary && fares.length > 0 && ` · bilety ok. ${fares.map(formatAmount).join(' + ')} / os.`}
      {limited && <span className="text-red not-italic"> ● limit dojazdów wyczerpany</span>}
    </p>
  )
}

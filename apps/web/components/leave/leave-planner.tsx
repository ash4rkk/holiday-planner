'use client'

import {
  type DayEvent,
  type HolidayRegion,
  leaveInYear,
  REGION_LABEL,
  todayLocal,
} from '@planer/core'
import { CalendarCog, Layers as LayersIcon, Plus } from 'lucide-react'
import Link from 'next/link'
import { useRef, useState } from 'react'
import { createLeave, deleteLeave, restoreLeave, updateLeave } from '@/app/(app)/leave/actions'
import { Toast } from '@/components/toast-stack'
import { TopBar, TRIPS_BACK } from '@/components/top-bar'
import { cx } from '@/components/ui'
import { UndoToast } from '@/components/undo-toast'
import { offerUndo } from '@/lib/undo'
import { useDismiss } from '@/lib/use-dismiss'
import { useLeaveLayers } from '@/lib/use-leave-layers'
import { GanttView } from './gantt-view'
import { LeaveSheet, type SheetValue } from './leave-sheet'
import { ListView } from './list-view'
import {
  type LeaveView,
  type PlannerCalendar,
  type PlannerPeriod,
  type PlannerTrip,
  useDayIndex,
  VIEW_LABELS,
} from './model'
import { MonthView } from './month-view'
import { MonthsView } from './months-view'

const VIEWS = Object.keys(VIEW_LABELS) as LeaveView[]
const daysWord = (n: number) => (n === 1 ? 'dzień' : 'dni')

type Sheet = { kind: 'new'; value: SheetValue } | { kind: 'edit'; period: PlannerPeriod }

const byStart = (a: PlannerPeriod, b: PlannerPeriod) => a.startDate.localeCompare(b.startDate)

/** Planer urlopów: wspólny plan dni wolnych, liczony wg świąt wybranego regionu. */
export function LeavePlanner({
  year,
  region,
  initialView,
  initialMonth,
  periods: initialPeriods,
  trips,
  events,
  calendars,
}: {
  year: number
  region: HolidayRegion
  initialView: LeaveView
  initialMonth: number
  periods: PlannerPeriod[]
  trips: PlannerTrip[]
  events: DayEvent[]
  calendars: PlannerCalendar[]
}) {
  const today = todayLocal()
  const [periods, setPeriods] = useState(initialPeriods)
  const [view, setView] = useState(initialView)
  const [month, setMonth] = useState(initialMonth)
  const [picking, setPicking] = useState<string | null>(null)
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [layers, setLayers] = useLeaveLayers()
  const index = useDayIndex(year, region, periods, trips, events, layers)
  const total = leaveInYear(periods, year, region)
  const count = periods.filter(
    (p) => p.endDate >= `${year}-01-01` && p.startDate <= `${year}-12-31`,
  ).length

  const go = (next: { view?: LeaveView; month?: number }) => {
    const v = next.view ?? view
    const m = next.month ?? month
    setView(v)
    setMonth(m)
    const url = new URL(window.location.href)
    url.searchParams.set('view', v)
    if (v === 'month') url.searchParams.set('m', String(m + 1))
    else url.searchParams.delete('m')
    window.history.replaceState(window.history.state, '', url)
  }

  const yearHref = (y: number) =>
    `/leave?year=${y}&view=${view}${view === 'month' ? `&m=${month + 1}` : ''}`

  const openNew = (startDate = today, endDate = startDate) => {
    setError(undefined)
    setPicking(null)
    setSheet({ kind: 'new', value: { startDate, endDate, note: '' } })
  }

  const pick = (date: string) => {
    if (!picking) {
      const period = index.period(date)
      if (period) {
        setError(undefined)
        setSheet({ kind: 'edit', period })
        return
      }
      setPicking(date)
      return
    }
    const [a, b] = picking <= date ? [picking, date] : [date, picking]
    openNew(a, b)
  }

  const save = async (v: SheetValue) => {
    if (!sheet) return
    setBusy(true)
    const input = { startDate: v.startDate, endDate: v.endDate, note: v.note }
    const res =
      sheet.kind === 'edit' ? await updateLeave(sheet.period.id, input) : await createLeave(input)
    setBusy(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setPeriods((list) => [...list.filter((p) => p.id !== res.period.id), res.period].sort(byStart))
    setSheet(null)
  }

  const remove = async (period: PlannerPeriod) => {
    setSheet(null)
    setPeriods((list) => list.filter((p) => p.id !== period.id))
    if (!(await deleteLeave(period.id))) return
    offerUndo('urlop do kosza', async () => {
      const res = await restoreLeave(period)
      if (res.ok) setPeriods((list) => [...list, res.period].sort(byStart))
    })
  }

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-1">
      <TopBar
        title="urlopy"
        back={TRIPS_BACK}
        actions={
          <>
            <Link
              href="/settings/calendars?from=/leave"
              aria-label="kalendarze i święta"
              title="kalendarze i święta"
              className="flex size-11 items-center justify-center text-muted hover:text-accent"
            >
              <CalendarCog className="size-5" aria-hidden="true" />
            </Link>
            <button
              type="button"
              onClick={() => openNew()}
              aria-label="dodaj urlop"
              title="dodaj urlop"
              className="flex size-11 items-center justify-center text-accent hover:text-accent-hover"
            >
              <Plus className="size-5" aria-hidden="true" />
            </button>
          </>
        }
      />

      <section
        className="island flex flex-wrap items-center gap-x-3 gap-y-1 p-1 pl-1"
        aria-label="podsumowanie"
      >
        <div className="flex items-center">
          <Link
            href={yearHref(year - 1)}
            aria-label={`rok ${year - 1}`}
            className="flex size-11 items-center justify-center text-lg text-muted hover:text-accent"
          >
            ‹
          </Link>
          <span className="font-bold tabular-nums">{year}</span>
          <Link
            href={yearHref(year + 1)}
            aria-label={`rok ${year + 1}`}
            className="flex size-11 items-center justify-center text-lg text-muted hover:text-accent"
          >
            ›
          </Link>
        </div>
        <p className="min-w-0 flex-1 text-sm">
          <span className="font-bold tabular-nums">
            {total} {daysWord(total)} urlopu
          </span>
          <span className="text-muted">
            {count > 0 && ` · ${count} ${count === 1 ? 'okres' : count < 5 ? 'okresy' : 'okresów'}`}
          </span>
          <span className="block text-xs text-subtle">wg świąt: {REGION_LABEL[region]}</span>
        </p>
      </section>

      <div className="flex items-center gap-1">
        <div className="island flex min-w-0 flex-1 gap-0.5 overflow-x-auto p-1" role="tablist">
          {VIEWS.map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              onClick={() => go({ view: v })}
              className={cx(
                'min-h-9 shrink-0 rounded-inner px-3 text-sm',
                view === v ? 'bg-active font-bold text-text' : 'text-muted hover:text-accent',
              )}
            >
              {VIEW_LABELS[v]}
            </button>
          ))}
        </div>
        <LayersMenu layers={layers} setLayers={setLayers} calendars={calendars} />
      </div>

      {view === 'months' && (
        <MonthsView
          year={year}
          region={region}
          periods={periods}
          index={index}
          today={today}
          picking={picking}
          onPick={pick}
          onOpenMonth={(m) => go({ view: 'month', month: m })}
        />
      )}
      {view === 'month' && (
        <MonthView
          year={year}
          month={month}
          index={index}
          today={today}
          picking={picking}
          onPick={pick}
          onMonth={(m) => go({ month: m })}
        />
      )}
      {view === 'list' && (
        <ListView
          year={year}
          region={region}
          periods={periods}
          index={index}
          layers={layers}
          onEdit={(p) => {
            setError(undefined)
            setSheet({ kind: 'edit', period: p })
          }}
          onAdd={() => openNew()}
        />
      )}
      {view === 'gantt' && (
        <GanttView
          year={year}
          periods={periods}
          index={index}
          layers={layers}
          calendars={calendars}
          today={today}
          onEdit={(p) => {
            setError(undefined)
            setSheet({ kind: 'edit', period: p })
          }}
        />
      )}

      {picking && (
        <Toast>
          <div
            role="status"
            className="island pop-in flex min-h-11 items-center gap-3 pr-1 pl-4 text-sm"
          >
            <span>● wybierz ostatni dzień urlopu</span>
            <button
              type="button"
              onClick={() => openNew(picking)}
              className="min-h-11 px-2 text-accent"
            >
              jeden dzień
            </button>
            <button
              type="button"
              onClick={() => setPicking(null)}
              className="min-h-11 px-2 text-muted"
            >
              anuluj
            </button>
          </div>
        </Toast>
      )}

      {sheet && (
        <LeaveSheet
          key={
            sheet.kind === 'edit'
              ? sheet.period.id
              : `${sheet.value.startDate}${sheet.value.endDate}`
          }
          title={sheet.kind === 'edit' ? 'urlop' : 'nowy urlop'}
          initial={
            sheet.kind === 'edit'
              ? {
                  startDate: sheet.period.startDate,
                  endDate: sheet.period.endDate,
                  note: sheet.period.note ?? '',
                }
              : sheet.value
          }
          region={region}
          error={error}
          busy={busy}
          onSave={save}
          onDelete={sheet.kind === 'edit' ? () => remove(sheet.period) : undefined}
          onClose={() => setSheet(null)}
        />
      )}
      <UndoToast />
    </main>
  )
}

function LayersMenu({
  layers,
  setLayers,
  calendars,
}: {
  layers: ReturnType<typeof useLeaveLayers>[0]
  setLayers: ReturnType<typeof useLeaveLayers>[1]
  calendars: PlannerCalendar[]
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useDismiss(open, () => setOpen(false), ref)
  const toggleCalendar = (id: string) =>
    setLayers({
      hiddenCalendars: layers.hiddenCalendars.includes(id)
        ? layers.hiddenCalendars.filter((x) => x !== id)
        : [...layers.hiddenCalendars, id],
    })
  const row = (label: string, checked: boolean, onChange: () => void, hint?: string) => (
    <label
      key={label}
      className="flex min-h-11 items-center gap-3 rounded-inner px-3 text-sm hover:bg-raised"
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="size-5 accent-(--accent)"
      />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {hint && <span className="text-2xs text-subtle">{hint}</span>}
    </label>
  )
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cx(
          'island flex min-h-11 items-center gap-2 px-3 text-sm',
          open ? 'text-accent' : 'text-muted hover:text-accent',
        )}
      >
        <LayersIcon className="size-4" aria-hidden="true" />
        warstwy
      </button>
      {open && (
        <div className="island shadow-float pop-in absolute right-0 top-12 z-(--z-popover) flex w-72 flex-col p-1">
          {row('święta w Polsce', layers.pl, () => setLayers({ pl: !layers.pl }), '●')}
          {row('święta w Brandenburgii', layers.bb, () => setLayers({ bb: !layers.bb }), '○')}
          {row('wyjazdy', layers.trips, () => setLayers({ trips: !layers.trips }))}
          {calendars.length > 0 && (
            <p className="px-3 pt-2 pb-1 text-xs text-subtle italic">kalendarze (przydymione)</p>
          )}
          {calendars.map((c) =>
            row(c.name, !layers.hiddenCalendars.includes(c.id), () => toggleCalendar(c.id)),
          )}
          {calendars.length === 0 && (
            <Link
              href="/settings/calendars?from=/leave"
              className="flex min-h-11 items-center px-3 text-sm text-accent"
            >
              dodaj kalendarz ›
            </Link>
          )}
        </div>
      )}
    </div>
  )
}

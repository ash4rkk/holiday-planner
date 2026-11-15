'use client'

import {
  applyLeaveChange,
  type DayEvent,
  diffLeave,
  formatDateSpan,
  type LeaveRegions,
  leaveDayCounts,
  leaveDays,
  leaveInRange,
  mergeSharedLeave,
  type PaintMode,
  paintLeave,
  personLeaveDays,
  REGION_LABEL,
  regionOf,
  todayLocal,
} from '@planer/core'
import {
  CalendarCog,
  CalendarDays,
  Columns3,
  Layers as LayersIcon,
  LayoutGrid,
  type LucideIcon,
  Plus,
} from 'lucide-react'
import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  createLeave,
  deleteLeave,
  restoreLeave,
  swapLeavePeriods,
  updateLeave,
} from '@/app/(app)/leave/actions'
import { Toast } from '@/components/toast-stack'
import { TopBar, TRIPS_BACK } from '@/components/top-bar'
import { buttonClass, cx } from '@/components/ui'
import { UndoToast } from '@/components/undo-toast'
import { offerUndo } from '@/lib/undo'
import { useDismiss } from '@/lib/use-dismiss'
import { useLeaveLayers } from '@/lib/use-leave-layers'
import { ColumnsView } from './columns-view'
import { DayTooltip, useDayTooltip } from './day-tooltip'
import { LeaveSheet, type SheetValue } from './leave-sheet'
import { Legend } from './legend'
import { ListView } from './list-view'
import {
  type LeaveAt,
  type LeaveView,
  leaveBg,
  leaveCellClass,
  type PlannerCalendar,
  type PlannerPeriod,
  type PlannerTrip,
  useDayIndex,
  VIEW_LABELS,
  type Who,
  whoOf,
} from './model'
import { MonthView } from './month-view'
import { MonthsView } from './months-view'
import { PaintNavButton } from './paint-nav-button'
import { PersonPicker } from './person-picker'
import { usePaint } from './use-paint'

const VIEWS = Object.keys(VIEW_LABELS) as LeaveView[]
const VIEW_ICONS: Record<LeaveView, LucideIcon> = {
  columns: Columns3,
  months: LayoutGrid,
  month: CalendarDays,
}
/** Widoki, w których da się malować urlop. */
const PAINT_VIEWS: LeaveView[] = ['columns', 'months', 'month']
const daysWord = (n: number) => (n === 1 ? 'dzień' : 'dni')

type Sheet = { kind: 'new'; value: SheetValue } | { kind: 'edit'; period: PlannerPeriod }

const BRUSH_KEY = 'planer:leave-brush-person'

/** Czyj urlop maluje pędzel — pamiętane na urządzeniu (`null` = oboje). */
function useBrushPerson(persons: string[]): [Who, (w: Who) => void] {
  const [who, setWho] = useState<Who>(null)
  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem(BRUSH_KEY) ?? 'null') as unknown
      if (typeof v === 'string' && persons.includes(v)) setWho(v)
    } catch {}
  }, [persons])
  const set = (w: Who) => {
    setWho(w)
    try {
      localStorage.setItem(BRUSH_KEY, JSON.stringify(w))
    } catch {}
  }
  return [who, set]
}

const byStart = (a: PlannerPeriod, b: PlannerPeriod) => a.startDate.localeCompare(b.startDate)

/** Planer urlopów: wspólny plan dni wolnych, liczony wg świąt wybranego regionu. */
export function LeavePlanner({
  year,
  regions,
  initialView,
  initialMonth,
  periods: initialPeriods,
  trips,
  events,
  calendars,
  persons,
}: {
  year: number
  regions: LeaveRegions
  initialView: LeaveView
  initialMonth: number
  periods: PlannerPeriod[]
  trips: PlannerTrip[]
  events: DayEvent[]
  calendars: PlannerCalendar[]
  persons: string[]
}) {
  const today = todayLocal()
  const [periods, setPeriods] = useState(initialPeriods)
  const [view, setView] = useState(initialView)
  const [month, setMonth] = useState(initialMonth)
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [layers, setLayers] = useLeaveLayers()
  const [brush, setBrush] = useState(false)
  const [paintMode, setPaintMode] = useState<PaintMode>('add')
  const painting = brush && PAINT_VIEWS.includes(view)
  // Regiony, w których pracujecie: dzień jest szary, gdy wolny dla wszystkich.
  const workRegions = useMemo(
    () => [
      ...new Set(persons.length ? persons.map((p) => regionOf(regions, p)) : [regions.fallback]),
    ],
    [persons, regions],
  )
  const index = useDayIndex(year, workRegions, periods, trips, events, layers)
  const [brushPerson, setBrushPerson] = useBrushPerson(persons)
  const approvedOnly = periods.filter((p) => p.approved)
  const yearDays = (list: PlannerPeriod[], name: string) =>
    personLeaveDays(list, name, `${year}-01-01`, `${year}-12-31`, regionOf(regions, name))
  const totals = persons.map((name) => {
    const days = yearDays(periods, name)
    // dni, których nie pokrywa żaden zatwierdzony okres
    return { name, days, pending: days - yearDays(approvedOnly, name) }
  })
  const total = leaveInRange(periods, `${year}-01-01`, `${year}-12-31`, regions.fallback)
  const totalPending =
    total - leaveInRange(approvedOnly, `${year}-01-01`, `${year}-12-31`, regions.fallback)
  // Skala pasków: najdłuższy urlop w roku, nie mniej niż typowa roczna pula.
  const barScale = Math.max(26, ...totals.map((t) => t.days))

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
    setSheet({
      kind: 'new',
      value: { startDate, endDate, note: '', person: null, approved: false },
    })
  }

  /** Zamalowany zakres: od razu na ekranie i w bazie, „cofnij” przywraca poprzednie okresy. */
  const paintCommit = async (from: string, to: string, mode: PaintMode) => {
    const painted = paintLeave(periods, from, to, mode, () => crypto.randomUUID(), brushPerson)
    if (!painted.remove.length && !painted.insert.length) return
    // Ten sam okres u obu osób zapisujemy jako jeden urlop wspólny.
    const change = diffLeave(periods, mergeSharedLeave(applyLeaveChange(periods, painted), persons))
    if (!change.remove.length && !change.insert.length) return
    const before = periods
    const gone = new Set(change.remove.map((p) => p.id))
    const added = new Set(change.insert.map((p) => p.id))
    const local = change.insert.map((p) => ({
      ...p,
      approved: Boolean(p.approved),
      createdBy: null,
      createdAt: new Date(),
    }))
    const swap = (removeIds: Set<string>, insert: PlannerPeriod[]) =>
      setPeriods((list) => [...list.filter((p) => !removeIds.has(p.id)), ...insert].sort(byStart))
    swap(gone, local)
    const saved = await swapLeavePeriods({ remove: [...gone], insert: change.insert })
    if (!saved) {
      setPeriods(before)
      return
    }
    swap(added, saved)
    // Zmiana dni urlopu w roku dla każdej osoby (każda wg swoich świąt).
    const after = [...before.filter((p) => !gone.has(p.id)), ...local]
    const y0 = `${year}-01-01`
    const y1 = `${year}-12-31`
    const deltas = (persons.length ? persons : [null]).map((n) => {
      const count = (list: PlannerPeriod[]) =>
        n === null
          ? leaveInRange(list, y0, y1, regions.fallback)
          : personLeaveDays(list, n, y0, y1, regionOf(regions, n))
      return { n, d: count(after) - count(before) }
    })
    const signed = (d: number) => (d > 0 ? `+${d}` : d < 0 ? `−${-d}` : '0')
    const changed = deltas.filter((x) => x.d !== 0)
    const label = !changed.length
      ? 'urlop zmieniony'
      : deltas.every((x) => x.d === deltas[0]?.d)
        ? `${signed(deltas[0]?.d ?? 0)} ${daysWord(Math.abs(deltas[0]?.d ?? 0))} urlopu`
        : `${changed.map((x) => `${x.n} ${signed(x.d)}`).join(' · ')} dni urlopu`
    const old = change.remove.map(({ id, startDate, endDate, note, person, approved }) => ({
      id,
      startDate,
      endDate,
      note,
      person,
      approved,
    }))
    offerUndo(label, async () => {
      const back = await swapLeavePeriods({ remove: [...added], insert: old })
      if (back) swap(added, back)
    })
  }
  const tooltip = useDayTooltip(!painting)
  const paint = usePaint({ enabled: painting, mode: paintMode, onCommit: paintCommit })
  // Podpis zaznaczonego palcem zakresu w pasku pędzla.
  const pendingText = (() => {
    const r = paint.pending
    if (!r) return ''
    const span = formatDateSpan(r.from, r.to)
    if (paintMode === 'erase') return `usuń urlop · ${span}`
    const owner = brushPerson ?? persons[0]
    const n = leaveDays(r.from, r.to, owner ? regionOf(regions, owner) : regions.fallback)
    return `${span} · ${n} ${daysWord(n)} urlopu`
  })()

  /** Urlop w dniu tak, jak go widać: z podglądem malowania pędzlem osoby `brushPerson`. */
  const leaveAt: LeaveAt = (date) => {
    let list = index.periods(date)
    const mode = painting ? paint.paintAt(date) : null
    if (mode === 'erase') {
      list = list.filter((p) => brushPerson !== null && p.person !== brushPerson)
    }
    let who = whoOf(list)
    if (mode === 'add') {
      who = who === undefined || who === brushPerson ? brushPerson : null
      list = [...list, { person: brushPerson, approved: false } as PlannerPeriod]
    }
    if (who === undefined) return undefined
    // Weekend albo święto w urlopie (nikomu nie zużywa dnia): paski na kolorze urlopu.
    const counts = leaveDayCounts(date, list, persons, regions)
    const approved = list.every((p) => p.approved)
    return {
      who,
      cls: cx(leaveCellClass(who, persons, approved), !counts && 'leave-free'),
      counts,
      approved,
    }
  }

  /** Dotknięcie dnia: dymek z tym, co się dzieje (urlop dodaje tylko pędzel). */
  const pick = (date: string) => {
    if (painting) return
    tooltip.toggle(date)
  }
  // Dzień z otwartym dymkiem jest zaznaczony w kalendarzu.
  const picking = tooltip.tip?.pinned ? tooltip.tip.date : null

  /**
   * Ten sam okres u obu osób → jeden urlop wspólny: zapis w bazie i w stanie. Po zapisie z arkusza
   * i raz przy wejściu (porządkuje okresy dodane wcześniej osobno).
   */
  const mergeShared = async (list: PlannerPeriod[]) => {
    const change = diffLeave(list, mergeSharedLeave(list, persons))
    if (!change.remove.length && !change.insert.length) return
    const saved = await swapLeavePeriods({
      remove: change.remove.map((p) => p.id),
      insert: change.insert,
    })
    if (!saved) return
    const gone = new Set(change.remove.map((p) => p.id))
    setPeriods((cur) => [...cur.filter((p) => !gone.has(p.id)), ...saved].sort(byStart))
  }
  useEffect(() => {
    void mergeShared(initialPeriods)
  }, [])

  const save = async (v: SheetValue) => {
    if (!sheet) return
    setBusy(true)
    const input = {
      startDate: v.startDate,
      endDate: v.endDate,
      note: v.note,
      person: v.person,
      approved: v.approved,
    }
    const res =
      sheet.kind === 'edit' ? await updateLeave(sheet.period.id, input) : await createLeave(input)
    setBusy(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    const next = [...periods.filter((p) => p.id !== res.period.id), res.period].sort(byStart)
    setPeriods(next)
    setSheet(null)
    await mergeShared(next)
  }

  /** Status z listy: od razu na ekranie, w bazie w tle (przy błędzie wraca). */
  const toggleApproved = async (period: PlannerPeriod) => {
    const approved = !period.approved
    const flip = (value: boolean) =>
      setPeriods((list) => list.map((p) => (p.id === period.id ? { ...p, approved: value } : p)))
    flip(approved)
    const res = await updateLeave(period.id, {
      startDate: period.startDate,
      endDate: period.endDate,
      note: period.note ?? '',
      person: period.person,
      approved,
    })
    if (!res.ok) flip(period.approved)
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

      {/* Jeden wiersz: rok, sumy jako paski, widoki, warstwy i legenda (na telefonie dwa). */}
      <div className="flex flex-wrap items-stretch gap-1">
        <div className="island flex items-center">
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
        <section
          aria-label="dni urlopu w roku"
          className="island flex min-w-60 flex-1 flex-wrap items-center gap-x-4 gap-y-1 px-3 py-1.5 text-sm"
        >
          {totals.map((t) => (
            <LeaveBar
              key={t.name}
              name={t.name}
              days={t.days}
              pending={t.pending}
              scale={barScale}
              persons={persons}
            />
          ))}
          {persons.length > 0 ? (
            <span className="flex items-center gap-1 text-xs text-muted">
              <span aria-hidden="true" className="inline-block size-2.5 rounded-[3px] bg-accent" />
              oboje
            </span>
          ) : (
            <span className="font-bold tabular-nums">
              {total} {daysWord(total)}
              {totalPending > 0 && (
                <span className="font-normal text-muted"> · {totalPending} do zatwierdzenia</span>
              )}
            </span>
          )}
        </section>
        <div className="island flex shrink-0 gap-0.5 p-1" role="tablist" aria-label="widok">
          {VIEWS.map((v) => {
            const Icon = VIEW_ICONS[v]
            return (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={view === v}
                aria-label={VIEW_LABELS[v]}
                title={VIEW_LABELS[v]}
                onClick={() => go({ view: v })}
                className={cx(
                  'flex size-10 items-center justify-center rounded-inner',
                  view === v ? 'bg-active text-text' : 'text-muted hover:text-accent',
                )}
              >
                <Icon className="size-5" aria-hidden="true" />
              </button>
            )
          })}
        </div>
        <div className="island flex shrink-0 items-center gap-0.5 p-1">
          <LayersMenu layers={layers} setLayers={setLayers} calendars={calendars} />
          <Legend
            layers={layers}
            calendars={calendars.length}
            persons={persons}
            regionsText={`święta: ${
              persons.length
                ? persons.map((p) => `${p} ${REGION_LABEL[regionOf(regions, p)]}`).join(' · ')
                : REGION_LABEL[regions.fallback]
            }`}
          />
        </div>
      </div>

      {/* Przy malowaniu kalendarz dalej się przewija (zaznacza dotknięcie albo przytrzymanie, nie
          przesunięcie palca); bez menu systemowego przy przytrzymaniu. */}
      <div
        {...tooltip.bind}
        onContextMenu={(e) => {
          if (painting) e.preventDefault()
        }}
        onPointerDown={paint.onPointerDown}
        className={cx(
          painting && 'select-none [-webkit-touch-callout:none] [&_[data-date]]:cursor-crosshair',
        )}
      >
        {view === 'months' && (
          <MonthsView
            year={year}
            regions={regions}
            periods={periods}
            index={index}
            today={today}
            picking={picking}
            onPick={pick}
            onOpenMonth={(m) => go({ view: 'month', month: m })}
            paintAt={painting ? paint.paintAt : undefined}
            leaveAt={leaveAt}
            persons={persons}
          />
        )}
        {view === 'columns' && (
          <ColumnsView
            year={year}
            regions={regions}
            periods={periods}
            index={index}
            today={today}
            picking={picking}
            onPick={pick}
            paintAt={painting ? paint.paintAt : undefined}
            leaveAt={leaveAt}
            persons={persons}
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
            paintAt={painting ? paint.paintAt : undefined}
            leaveAt={leaveAt}
          />
        )}
      </div>
      {/* Okresy urlopu w roku zawsze pod kalendarzem. */}
      <section aria-label="urlopy w roku" className="flex flex-col gap-1 pt-2">
        <h2 className="px-1 text-xs text-subtle italic">urlopy w {year}</h2>
        <ListView
          year={year}
          regions={regions}
          periods={periods}
          index={index}
          layers={layers}
          persons={persons}
          onEdit={(p) => {
            setError(undefined)
            setSheet({ kind: 'edit', period: p })
          }}
          onAdd={() => openNew()}
          onToggleApproved={toggleApproved}
        />
      </section>

      {painting && !paint.active && (
        <Toast>
          <div role="status" className="island pop-in flex flex-col gap-2 p-2 text-sm">
            {paint.pending ? (
              <>
                <span className="px-2 font-bold tabular-nums">{pendingText}</span>
                <div className="grid grid-cols-2 gap-1">
                  <button type="button" onClick={paint.cancel} className={buttonClass('island')}>
                    anuluj
                  </button>
                  <button type="button" onClick={paint.confirm} className={buttonClass('primary')}>
                    zapisz
                  </button>
                </div>
              </>
            ) : (
              <>
                <span className="flex items-center gap-2 px-2">
                  {paint.anchor
                    ? `● ${formatDateSpan(paint.anchor, paint.anchor)} · dotknij ostatniego dnia`
                    : '● dotknij pierwszego dnia · albo przytrzymaj i przeciągnij'}
                  {paint.anchor && (
                    <button
                      type="button"
                      onClick={paint.cancel}
                      className="hit ml-auto text-xs text-muted hover:text-accent"
                    >
                      anuluj
                    </button>
                  )}
                </span>
                <div role="radiogroup" aria-label="co robi pędzel" className="flex gap-1">
                  {(['add', 'erase'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      role="radio"
                      aria-checked={paintMode === m}
                      onClick={() => setPaintMode(m)}
                      className={cx(
                        'flex min-h-11 flex-1 items-center justify-center rounded-small border px-3',
                        paintMode === m
                          ? 'border-accent bg-active font-bold text-text'
                          : 'border-line text-muted hover:text-accent',
                      )}
                    >
                      {m === 'add' ? 'dodaj' : 'usuń'}
                    </button>
                  ))}
                </div>
                <PersonPicker
                  persons={persons}
                  value={brushPerson}
                  onChange={setBrushPerson}
                  label="czyj urlop maluje pędzel"
                />
              </>
            )}
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
                  person: sheet.period.person,
                  approved: sheet.period.approved,
                }
              : sheet.value
          }
          regions={regions}
          persons={persons}
          error={error}
          busy={busy}
          onSave={save}
          onDelete={sheet.kind === 'edit' ? () => remove(sheet.period) : undefined}
          onClose={() => setSheet(null)}
        />
      )}
      {PAINT_VIEWS.includes(view) && (
        <PaintNavButton
          on={brush}
          onToggle={() => {
            tooltip.close()
            setBrush((b) => !b)
          }}
        />
      )}
      {tooltip.tip && (
        <DayTooltip
          tip={tooltip.tip}
          index={index}
          regions={regions}
          calendars={calendars}
          persons={persons}
          tipRef={tooltip.ref}
          onEdit={(period) => {
            tooltip.close()
            setError(undefined)
            setSheet({ kind: 'edit', period })
          }}
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
        aria-label="warstwy"
        title="warstwy"
        className={cx(
          'flex size-10 items-center justify-center rounded-inner',
          open ? 'bg-active text-text' : 'text-muted hover:text-accent',
        )}
      >
        <LayersIcon className="size-5" aria-hidden="true" />
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

/** Suma osoby w roku: imię, liczba dni i pasek (pełny = zatwierdzone, jasny = do zatwierdzenia). */
function LeaveBar({
  name,
  days,
  pending,
  scale,
  persons,
}: {
  name: string
  days: number
  pending: number
  scale: number
  persons: string[]
}) {
  const pct = (n: number) => `${Math.min(100, (n / scale) * 100)}%`
  return (
    <span
      className="flex items-center gap-1.5 tabular-nums"
      title={`${name}: ${days} ${daysWord(days)} urlopu${pending ? `, w tym ${pending} do zatwierdzenia` : ''}`}
    >
      {name} <span className="font-bold">{days}</span>
      <span aria-hidden="true" className="flex h-1.5 w-16 overflow-hidden rounded-full bg-line">
        <span className={leaveBg(name, persons)} style={{ width: pct(days - pending) }} />
        <span className={leaveCellClass(name, persons, false)} style={{ width: pct(pending) }} />
      </span>
      {pending > 0 && <span className="sr-only">, w tym {pending} do zatwierdzenia</span>}
    </span>
  )
}

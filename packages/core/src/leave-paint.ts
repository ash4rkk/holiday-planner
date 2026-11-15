import { addDays, dateRange } from './dates'
import { type HolidayRegion, isWorkday } from './holidays'

// Malowanie urlopu po kalendarzu: zamalowany zakres dodaje dni (łączy się z sąsiednimi okresami)
// albo je zmazuje (okres się skraca, dzieli na dwa albo znika). Czyste — liczy, co zmienić.
// Każdy okres ma osobę (imię profilu) albo `null` = wspólny. Pędzel maluje jedną z tych wartości:
// łączy się i zmazuje tylko okresy tej samej osoby; pędzel „oboje” zmazuje wszystko.

export interface PaintPeriod {
  id: string
  startDate: string
  endDate: string
  note: string | null
  person: string | null
  /** zatwierdzony w pracy (brak = do zatwierdzenia) */
  approved?: boolean
}

export type PaintMode = 'add' | 'erase'

export interface PaintChange<T extends PaintPeriod> {
  /** okresy do usunięcia (w całości, z poprzednimi danymi — do „cofnij”) */
  remove: T[]
  /** okresy do zapisania w ich miejsce */
  insert: PaintPeriod[]
}

export function paintLeave<T extends PaintPeriod>(
  periods: T[],
  from: string,
  to: string,
  mode: PaintMode,
  newId: () => string,
  person: string | null = null,
): PaintChange<T> {
  const [a, b] = from <= to ? [from, to] : [to, from]
  if (mode === 'add') {
    // Nachodzące i stykające się (dzień przed / dzień po) okresy tej samej osoby łączymy w jeden.
    const touching = periods.filter(
      (p) => p.person === person && p.startDate <= addDays(b, 1) && p.endDate >= addDays(a, -1),
    )
    if (touching.length === 1) {
      const [only] = touching as [T]
      if (only.startDate <= a && only.endDate >= b) return { remove: [], insert: [] }
    }
    const start = [a, ...touching.map((p) => p.startDate)].sort()[0] as string
    const end = [b, ...touching.map((p) => p.endDate)].sort().at(-1) as string
    const sorted = [...touching].sort((x, y) => x.startDate.localeCompare(y.startDate))
    const notes = [...new Set(sorted.map((p) => p.note?.trim()).filter(Boolean))]
    return {
      remove: touching,
      insert: [
        {
          // id pierwszego scalanego okresu zostaje (link do niego dalej działa)
          id: sorted[0]?.id ?? newId(),
          startDate: start,
          endDate: end,
          note: notes.length ? notes.join(' · ').slice(0, 200) : null,
          person,
          // domalowanie do zatwierdzonego okresu nie zmienia jego statusu
          approved: touching.some((p) => p.approved),
        },
      ],
    }
  }

  const hit = periods.filter(
    (p) => (person === null || p.person === person) && p.startDate <= b && p.endDate >= a,
  )
  const insert: PaintPeriod[] = []
  for (const p of hit) {
    if (p.startDate < a)
      insert.push({
        id: p.id,
        startDate: p.startDate,
        endDate: addDays(a, -1),
        note: p.note,
        person: p.person,
        approved: p.approved,
      })
    if (p.endDate > b) {
      insert.push({
        id: p.startDate < a ? newId() : p.id,
        startDate: addDays(b, 1),
        endDate: p.endDate,
        note: p.note,
        person: p.person,
        approved: p.approved,
      })
    }
  }
  return { remove: hit, insert }
}

export interface PersonPeriod {
  startDate: string
  endDate: string
  person: string | null
}

/** Czy okres dotyczy osoby (jej własny albo wspólny). */
export const leaveOf = (p: { person: string | null }, person: string) =>
  p.person === null || p.person === person

/**
 * Dni urlopu osoby w zakresie: jej okresy i wspólne, dzień nakładających się okresów liczy się raz.
 */
export function personLeaveDays(
  periods: PersonPeriod[],
  person: string,
  from: string,
  to: string,
  region: HolidayRegion,
): number {
  const days = new Set<string>()
  for (const p of periods) {
    if (!leaveOf(p, person)) continue
    const a = p.startDate > from ? p.startDate : from
    const b = p.endDate < to ? p.endDate : to
    for (const d of dateRange(a, b)) days.add(d)
  }
  let n = 0
  for (const d of days) if (isWorkday(d, region)) n++
  return n
}

/** Region świąt każdej osoby (gdzie pracuje); `fallback` dla osób spoza listy i bez profili. */
export interface LeaveRegions {
  fallback: HolidayRegion
  byPerson: Record<string, HolidayRegion>
}

export const regionOf = (regions: LeaveRegions, person: string): HolidayRegion =>
  regions.byPerson[person] ?? regions.fallback

/** Osoby, których dotyczy okres: jego osoba albo wszystkie (wspólny). */
const ownersOf = (p: { person: string | null }, persons: string[]) =>
  p.person ? [p.person] : persons

/**
 * Ile dni urlopu zużywa okres, osobno dla każdej osoby (każda wg swojego regionu). Gdy wszystkim
 * tyle samo — jedna pozycja z `person: null`.
 */
export function periodLeaveDays(
  p: PersonPeriod,
  persons: string[],
  regions: LeaveRegions,
): { person: string | null; days: number }[] {
  const owners = ownersOf(p, persons)
  if (!owners.length) return [{ person: null, days: leaveDaysIn(p, regions.fallback) }]
  const list = owners.map((person) => ({
    person,
    days: leaveDaysIn(p, regionOf(regions, person)),
  }))
  if (p.person) return list
  return list.every((x) => x.days === list[0]?.days)
    ? [{ person: null, days: list[0]?.days ?? 0 }]
    : list
}

const leaveDaysIn = (p: { startDate: string; endDate: string }, region: HolidayRegion) =>
  dateRange(p.startDate, p.endDate).filter((d) => isWorkday(d, region)).length

/** Czy dzień urlopu (z tych okresów) zużywa komuś dzień urlopu — dzień roboczy w jego regionie. */
export function leaveDayCounts(
  date: string,
  list: { person: string | null }[],
  persons: string[],
  regions: LeaveRegions,
): boolean {
  return list.some((p) => {
    const owners = ownersOf(p, persons)
    if (!owners.length) return isWorkday(date, regions.fallback)
    return owners.some((person) => isWorkday(date, regionOf(regions, person)))
  })
}

/** Lista okresów po zmianie (usunięte wypadają, wstawione dochodzą). */
export function applyLeaveChange<T extends PaintPeriod>(
  list: T[],
  change: PaintChange<T>,
): PaintPeriod[] {
  const gone = new Set(change.remove.map((p) => p.id))
  return [...list.filter((p) => !gone.has(p.id)), ...change.insert]
}

/** Kolejne dni zbioru jako zakresy od–do. */
function runsOf(days: Set<string>): [string, string][] {
  const sorted = [...days].sort()
  const runs: [string, string][] = []
  for (const d of sorted) {
    const last = runs.at(-1)
    if (last && addDays(last[1], 1) === d) last[1] = d
    else runs.push([d, d])
  }
  return runs
}

const joinNotes = (notes: (string | null)[]) => {
  const list = [...new Set(notes.map((n) => n?.trim()).filter(Boolean))]
  return list.length ? list.join(' · ').slice(0, 200) : null
}

/**
 * Dni, w które urlop ma każda osoba, to urlop wspólny. Wspólną część wydzielamy jako okres bez
 * osoby (dokleja się do stykającego wspólnego), a okresy osób przycinamy do reszty — np. Arek 1–10
 * i Wera 5–15 → wspólny 5–10, Arek 1–4, Wera 11–15. Notatki przechodzą do kawałków, z których
 * powstały. Działa tylko przy co najmniej dwóch osobach; bez nakładania lista zostaje bez zmian.
 */
export function mergeSharedLeave(
  list: PaintPeriod[],
  persons: string[],
  newId: () => string = () => crypto.randomUUID(),
): PaintPeriod[] {
  if (persons.length < 2) return list
  const days = (p: PaintPeriod) => dateRange(p.startDate, p.endDate)
  const sharedDays = new Set(list.filter((p) => p.person === null).flatMap(days))
  const byPerson = new Map(persons.map((name) => [name, new Set<string>()]))
  for (const p of list) if (p.person) for (const d of days(p)) byPerson.get(p.person)?.add(d)
  const [firstSet, ...rest] = [...byPerson.values()] as Set<string>[]
  // Nowe dni wspólne: każda osoba ma urlop, a wspólnego jeszcze nie ma.
  const fresh = new Set(
    [...(firstSet ?? [])].filter((d) => !sharedDays.has(d) && rest.every((s) => s.has(d))),
  )
  const covered = (d: string) => sharedDays.has(d) || fresh.has(d)
  const touched = list.some((p) => p.person !== null && days(p).some(covered))
  if (!touched) return list

  const used = new Set<string>()
  const take = (id: string) => {
    const free = !used.has(id)
    used.add(id)
    return free ? id : newId()
  }
  const out: PaintPeriod[] = []
  // Okresy osób bez dni wspólnych — w kawałkach, pierwszy zachowuje id.
  const consumed: PaintPeriod[] = []
  for (const p of list) {
    if (p.person === null) continue
    const own = new Set(days(p).filter((d) => !covered(d)))
    if (own.size === days(p).length) {
      used.add(p.id)
      out.push(p)
      continue
    }
    const runs = runsOf(own)
    if (!runs.length) consumed.push(p)
    for (const [startDate, endDate] of runs) {
      out.push({ ...p, id: used.has(p.id) ? newId() : take(p.id), startDate, endDate })
    }
  }
  // Wspólne: istniejące i nowe zakresy; nowy zakres łączy się ze stykającym albo nachodzącym.
  type Item = PaintPeriod & { isNew: boolean }
  const items: Item[] = [
    ...list.filter((p) => p.person === null).map((p) => ({ ...p, isNew: false })),
    ...runsOf(fresh).map(([startDate, endDate]) => ({
      id: '',
      startDate,
      endDate,
      note: null,
      person: null,
      approved: false,
      isNew: true,
    })),
  ].sort((a, b) => a.startDate.localeCompare(b.startDate))
  const groups: Item[][] = []
  for (const it of items) {
    const g = groups.at(-1)
    const end = g ? g.reduce((m, x) => (x.endDate > m ? x.endDate : m), '') : ''
    if (g && addDays(end, 1) >= it.startDate && (it.isNew || g.some((x) => x.isNew))) g.push(it)
    else groups.push([it])
  }
  for (const g of groups) {
    const startDate = g[0]?.startDate as string
    const endDate = g.reduce((m, x) => (x.endDate > m ? x.endDate : m), startDate)
    const overlaps = (p: PaintPeriod) => p.startDate <= endDate && p.endDate >= startDate
    const old = g.filter((x) => !x.isNew)
    // Notatki: wspólnych z grupy i osób, których dni weszły do wspólnego.
    const fromPersons = list.filter(
      (p) => p.person !== null && overlaps(p) && days(p).some(covered),
    )
    // Wspólna część zatwierdzona tylko, gdy zatwierdzone było wszystko, z czego powstała.
    const hasNew = g.some((x) => x.isNew)
    const approved =
      old.every((x) => x.approved) && (!hasNew || fromPersons.every((p) => p.approved))
    const reuse = old[0] ?? consumed.find((p) => overlaps(p) && !used.has(p.id))
    const id = reuse ? take(reuse.id) : newId()
    out.push({
      id,
      startDate,
      endDate,
      note: joinNotes([...old.map((x) => x.note), ...fromPersons.map((p) => p.note)]),
      person: null,
      approved,
    })
  }
  return out.sort(
    (a, b) =>
      a.startDate.localeCompare(b.startDate) ||
      Number(a.person !== null) - Number(b.person !== null),
  )
}

/** Co zmienić w bazie, żeby z `before` zrobić `after` (porównanie po id i treści). */
export function diffLeave<T extends PaintPeriod>(
  before: T[],
  after: PaintPeriod[],
): PaintChange<T> {
  const same = (a: PaintPeriod, b: PaintPeriod) =>
    a.startDate === b.startDate &&
    a.endDate === b.endDate &&
    a.note === b.note &&
    a.person === b.person &&
    Boolean(a.approved) === Boolean(b.approved)
  const afterById = new Map(after.map((p) => [p.id, p]))
  const beforeById = new Map(before.map((p) => [p.id, p]))
  return {
    remove: before.filter((p) => {
      const a = afterById.get(p.id)
      return !a || !same(p, a)
    }),
    insert: after
      .filter((p) => {
        const b = beforeById.get(p.id)
        return !b || !same(p, b)
      })
      .map(({ id, startDate, endDate, note, person, approved }) => ({
        id,
        startDate,
        endDate,
        note,
        person,
        approved: Boolean(approved),
      })),
  }
}

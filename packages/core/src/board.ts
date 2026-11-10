import { nanoid } from 'nanoid'
import * as Y from 'yjs'
import { byDayPlace, byTime, CARD_SIZE, type CardSnapshot, GRID, snapToGrid } from './cards'
import { dateRange } from './dates'
import { roundClock, shiftClock, TYPICAL_STAY_MIN } from './gaps'
import { cardsOf } from './trip-doc'

// Tablica w dokumencie wyjazdu:
//   frames: Y.Map<frameId, Y.Map{ title, x, y, w, h }>   — ramki-grupy
//   edges:  Y.Map<edgeId, Y.Map{ from, to, label? }>     — strzałki między kartami
//   widgets: Y.Map<kind, Y.Map{ x, y }>                  — widżety postawione z „+” (lista pakowania)
// Karty mają pozycje bezwzględne; przynależność do ramki to pole karty `frameId`.

export type FrameSnapshot = {
  id: string
  title: string
  x: number
  y: number
  w: number
  h: number
}
export type EdgeSnapshot = { id: string; from: string; to: string; label?: string }
export type Rect = { x: number; y: number; w: number; h: number }
export type Positions = Record<string, { x: number; y: number; frameId?: string }>

export const FRAME_SIZE = { w: 600, h: 400 } as const

/** Widżety Tablicy: każdy rodzaj najwyżej raz (to skrót do czegoś, co wyjazd ma i tak). */
export const WIDGET_KINDS = ['packing'] as const
export type WidgetKind = (typeof WIDGET_KINDS)[number]
export type WidgetSnapshot = { kind: WidgetKind; x: number; y: number }
export const WIDGET_SIZE: Record<WidgetKind, { w: number; h: number }> = {
  packing: { w: 240, h: 200 },
}
// „Ułóż wg dni”: odstęp kolumn mieści obrysy dni (web: DAY_PAD), a pionowy — strzałki kolejności.
const DAY_GAP = { x: GRID * 6, y: GRID * 3 }

export function framesOf(doc: Y.Doc): Y.Map<Y.Map<unknown>> {
  return doc.getMap<Y.Map<unknown>>('frames')
}

export function edgesOf(doc: Y.Doc): Y.Map<Y.Map<unknown>> {
  return doc.getMap<Y.Map<unknown>>('edges')
}

export function widgetsOf(doc: Y.Doc): Y.Map<Y.Map<unknown>> {
  return doc.getMap<Y.Map<unknown>>('widgets')
}

function toYMap(values: Record<string, unknown>): Y.Map<unknown> {
  const map = new Y.Map<unknown>()
  for (const [k, v] of Object.entries(values)) if (v !== undefined) map.set(k, v)
  return map
}

export function readFrames(doc: Y.Doc): FrameSnapshot[] {
  return [...framesOf(doc).entries()].map(([id, f]) => ({
    id,
    ...(f.toJSON() as Omit<FrameSnapshot, 'id'>),
  }))
}

export function readEdges(doc: Y.Doc): EdgeSnapshot[] {
  return [...edgesOf(doc).entries()].map(([id, e]) => ({
    id,
    ...(e.toJSON() as Omit<EdgeSnapshot, 'id'>),
  }))
}

export function readWidgets(doc: Y.Doc): WidgetSnapshot[] {
  return [...widgetsOf(doc).entries()]
    .filter(([kind]) => (WIDGET_KINDS as readonly string[]).includes(kind))
    .map(([kind, w]) => ({
      kind: kind as WidgetKind,
      x: (w.get('x') as number) ?? 0,
      y: (w.get('y') as number) ?? 0,
    }))
}

/** Stawia widżet w punkcie (środek widżetu); już postawiony zostaje tam, gdzie był. */
export function placeWidget(doc: Y.Doc, kind: WidgetKind, center: { x: number; y: number }) {
  if (widgetsOf(doc).has(kind)) return
  const { w, h } = WIDGET_SIZE[kind]
  widgetsOf(doc).set(
    kind,
    toYMap({ x: snapToGrid(center.x - w / 2), y: snapToGrid(center.y - h / 2) }),
  )
}

export function removeWidget(doc: Y.Doc, kind: WidgetKind) {
  widgetsOf(doc).delete(kind)
}

// ---------- ramki ----------

export function createFrame(
  doc: Y.Doc,
  frame: Partial<Omit<FrameSnapshot, 'id'>> & { x: number; y: number },
): string {
  const id = nanoid(12)
  doc.transact(() => {
    framesOf(doc).set(id, toYMap({ title: 'ramka', ...FRAME_SIZE, ...frame }))
    assignFrames(doc)
  })
  return id
}

export function renameFrame(doc: Y.Doc, id: string, title: string) {
  framesOf(doc).get(id)?.set('title', title)
}

/** Nowy prostokąt ramki (po zmianie rozmiaru); karty przypisują się na nowo. */
export function resizeFrame(doc: Y.Doc, id: string, rect: Rect) {
  const frame = framesOf(doc).get(id)
  if (!frame) return
  doc.transact(() => {
    for (const [k, v] of Object.entries(rect)) frame.set(k, Math.round(v))
    assignFrames(doc)
  })
}

/** Usuwa ramkę; jej karty zostają na miejscu, bez ramki. */
export function deleteFrame(doc: Y.Doc, id: string) {
  doc.transact(() => {
    framesOf(doc).delete(id)
    for (const card of cardsOf(doc).values()) if (card.get('frameId') === id) card.delete('frameId')
  })
}

// ---------- przesuwanie ----------

/** Zapis pozycji po przeciągnięciu kart i ramek. Ramka niesie swoje karty (przesuwa je wywołujący). */
export function moveItems(
  doc: Y.Doc,
  moves: { cards?: Positions; frames?: Positions; widgets?: Positions },
) {
  doc.transact(() => {
    for (const [kind, p] of Object.entries(moves.widgets ?? {})) {
      const widget = widgetsOf(doc).get(kind)
      widget?.set('x', Math.round(p.x))
      widget?.set('y', Math.round(p.y))
    }
    for (const [id, p] of Object.entries(moves.cards ?? {})) {
      const card = cardsOf(doc).get(id)
      card?.set('x', Math.round(p.x))
      card?.set('y', Math.round(p.y))
    }
    for (const [id, p] of Object.entries(moves.frames ?? {})) {
      const frame = framesOf(doc).get(id)
      frame?.set('x', Math.round(p.x))
      frame?.set('y', Math.round(p.y))
    }
    assignFrames(doc)
  })
}

/** Ramka, w której leży środek karty (najmniejsza, gdy ramki na siebie zachodzą). */
export function frameAt(frames: FrameSnapshot[], card: Rect): string | undefined {
  const cx = card.x + card.w / 2
  const cy = card.y + card.h / 2
  return frames
    .filter((f) => cx >= f.x && cx <= f.x + f.w && cy >= f.y && cy <= f.y + f.h)
    .sort((a, b) => a.w * a.h - b.w * b.h)[0]?.id
}

/** Przelicza `frameId` wszystkich kart z ich pozycji. */
export function assignFrames(doc: Y.Doc) {
  const frames = readFrames(doc)
  doc.transact(() => {
    for (const card of cardsOf(doc).values()) {
      const rect = {
        x: card.get('x') as number,
        y: card.get('y') as number,
        w: (card.get('w') as number) ?? CARD_SIZE.w,
        h: (card.get('h') as number) ?? CARD_SIZE.h,
      }
      const frameId = frameAt(frames, rect)
      if (frameId !== card.get('frameId')) {
        if (frameId) card.set('frameId', frameId)
        else card.delete('frameId')
      }
    }
  })
}

// ---------- strzałki ----------

export function createEdge(
  doc: Y.Doc,
  from: string,
  to: string,
  label?: string,
): string | undefined {
  if (from === to) return undefined
  const existing = readEdges(doc).find((e) => e.from === from && e.to === to)
  if (existing) return existing.id
  const id = nanoid(12)
  edgesOf(doc).set(id, toYMap({ from, to, label }))
  return id
}

export function setEdgeLabel(doc: Y.Doc, id: string, label: string) {
  const edge = edgesOf(doc).get(id)
  if (!edge) return
  if (label.trim()) edge.set('label', label.trim())
  else edge.delete('label')
}

export function deleteEdge(doc: Y.Doc, id: string) {
  edgesOf(doc).delete(id)
}

/** Strzałki do widoku: obie karty istnieją i nie są w koszu. */
export function visibleEdges(edges: EdgeSnapshot[], cards: CardSnapshot[]): EdgeSnapshot[] {
  const live = new Set(cards.filter((c) => !c.deletedAt).map((c) => c.id))
  return edges.filter((e) => live.has(e.from) && live.has(e.to))
}

// ---------- ułóż wg dni ----------

/** Dni z kartami (bez kosza) i id kart w kolejności dnia — do obrysów dni i strzałek kolejności. */
export function dayOrder(cards: CardSnapshot[]): { date: string; ids: string[] }[] {
  const byDate = new Map<string, CardSnapshot[]>()
  for (const c of cards) {
    if (c.deletedAt || !c.date) continue
    byDate.set(c.date, [...(byDate.get(c.date) ?? []), c])
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, day]) => ({ date, ids: day.sort(byTime).map((c) => c.id) }))
}

/** Czy odcinek przecina prostokąt (Liang–Barsky) — strzałka kolejności omija wtedy kartę łukiem. */
export function segmentHitsRect(
  a: { x: number; y: number },
  b: { x: number; y: number },
  r: Rect,
): boolean {
  const dx = b.x - a.x
  const dy = b.y - a.y
  let enter = 0
  let leave = 1
  for (const [p, q] of [
    [-dx, a.x - r.x],
    [dx, r.x + r.w - a.x],
    [-dy, a.y - r.y],
    [dy, r.y + r.h - a.y],
  ] as const) {
    if (p === 0) {
      if (q < 0) return false
      continue
    }
    if (p < 0) enter = Math.max(enter, q / p)
    else leave = Math.min(leave, q / p)
    if (enter > leave) return false
  }
  return true
}

/**
 * Wysokość linii „teraz”: tuż pod ostatnią rozpoczętą kartą, a gdy następna leży blisko — w połowie
 * przerwy. Karty mogą stać poza kolejnością, więc środek między nimi mógłby wypaść na cudzej karcie.
 */
export function nowLineY(
  before: { bottom: number } | undefined,
  after: { top: number } | undefined,
): number {
  if (!before) return (after?.top ?? 0) - 16
  if (!after) return before.bottom + 16
  const room = after.top - before.bottom
  return before.bottom + (room > 0 ? Math.min(room / 2, DAY_GAP.y / 2) : DAY_GAP.y / 2)
}

const toMin = (hhmm: string) => {
  const [h = 0, m = 0] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/**
 * Linia „teraz” wg godziny, nie wg odstępu: w trakcie karty przecina ją w miejscu proporcjonalnym do
 * upływu jej czasu; między kartami stoi w przerwie proporcjonalnie do czasu, jaki z niej minął.
 * Karta bez czasu trwania trwa do następnej. `column` — karty dnia z godziną, w kolejności.
 */
export function nowLineAt(
  column: { time: string; durationMin?: number; top: number; bottom: number }[],
  now: string,
): number {
  const t = toMin(now)
  const MARGIN = 6
  for (const [i, c] of column.entries()) {
    const start = toMin(c.time)
    const next = column[i + 1]
    const end = c.durationMin ? start + c.durationMin : next ? toMin(next.time) : start + 60
    if (t >= start && t < end && c.durationMin) {
      return c.top + ((c.bottom - c.top) * (t - start)) / Math.max(1, end - start)
    }
    if (next && t >= end && t < toMin(next.time)) {
      const gapFrom = c.bottom + MARGIN
      const gapTo = next.top - MARGIN
      const frac = (t - end) / Math.max(1, toMin(next.time) - end)
      return gapTo > gapFrom ? gapFrom + (gapTo - gapFrom) * frac : (c.bottom + next.top) / 2
    }
    // Karta bez czasu trwania, która właśnie trwa: linia tuż pod nią (do startu następnej).
    if (t >= start && t < end) return next ? c.bottom + MARGIN : c.bottom + 16
  }
  const first = column[0]
  if (first && t < toMin(first.time)) return first.top - 16
  const last = column.at(-1)
  return (last?.bottom ?? 0) + 16
}

export type DropCard = {
  id: string
  top: number
  bottom: number
  left: number
  right: number
  time?: string
  durationMin?: number
}
export type DropColumn = { date: string; x: number; w: number; cards: DropCard[] }
export type DropTarget =
  | { kind: 'variant'; id: string }
  | { kind: 'day'; date: string; x: number; y: number; w: number; empty: boolean; time?: string }

/** Kolumny dni do upuszczania: dni z kartami, a puste dni wyjazdu w siatce obok nich. */
export function dropColumns(
  cards: (DropCard & { date: string })[],
  trip: { startDate?: string | null; endDate?: string | null },
): DropColumn[] {
  const byDate = new Map<string, DropCard[]>()
  for (const c of cards) byDate.set(c.date, [...(byDate.get(c.date) ?? []), c])
  const known = [...byDate.entries()].map(([date, day]): DropColumn => {
    const x = Math.min(...day.map((c) => c.left))
    return {
      date,
      x,
      w: Math.max(...day.map((c) => c.right)) - x,
      cards: [...day].sort((a, b) => a.top - b.top),
    }
  })
  if (!trip.startDate) return known
  const dates = dateRange(trip.startDate, trip.endDate ?? trip.startDate)
  const anchor = known.find((c) => dates.includes(c.date))
  const stride = CARD_SIZE.w + DAY_GAP.x
  const empty = dates
    .filter((date) => !byDate.has(date))
    .map(
      (date): DropColumn => ({
        date,
        x:
          (anchor?.x ?? 0) +
          (dates.indexOf(date) - (anchor ? dates.indexOf(anchor.date) : 0)) * stride,
        w: CARD_SIZE.w,
        cards: [],
      }),
    )
  return [...known, ...empty]
}

/** Godzina dla miejsca między kartami: po poprzedniej z zapasem albo przed następną. */
function suggestTime(
  prev: DropCard | undefined,
  next: DropCard | undefined,
  durationMin: number,
  bufferMin: number,
): string | undefined {
  // Karta bez czasu trwania: nie wiadomo, ile potrwa, więc liczymy typowy postój.
  const stay = prev?.durationMin ?? TYPICAL_STAY_MIN
  if (prev?.time) return roundClock(shiftClock(prev.time, stay + bufferMin))
  if (next?.time) return shiftClock(next.time, -(durationMin + bufferMin))
  return undefined
}

/**
 * Co jest pod upuszczaną kartą: inna karta (wariant) albo miejsce w dniu, z godziną pasującą do
 * sąsiadów. Własna godzina karty zostaje, jeśli mieści się między nimi.
 */
export function dropTarget(
  at: { x: number; y: number },
  columns: DropColumn[],
  card: { id: string; time?: string; durationMin?: number },
  bufferMin: number,
): DropTarget | null {
  const reach = DAY_GAP.x / 2
  const column = columns.find((c) => at.x >= c.x - reach && at.x <= c.x + c.w + reach)
  if (!column) return null
  const others = column.cards.filter((c) => c.id !== card.id)
  const hit = others.find(
    (c) => at.y >= c.top && at.y <= c.bottom && at.x >= c.left && at.x <= c.right,
  )
  if (hit) return { kind: 'variant', id: hit.id }

  const prev = others.filter((c) => c.bottom <= at.y).at(-1)
  const next = others.find((c) => c.top >= at.y)
  const fits =
    card.time && (!prev?.time || prev.time <= card.time) && (!next?.time || card.time <= next.time)
  return {
    kind: 'day',
    date: column.date,
    x: column.x,
    y: prev && next ? (prev.bottom + next.top) / 2 : prev ? prev.bottom + 16 : at.y,
    w: column.w,
    empty: !others.length,
    time: fits ? card.time : suggestTime(prev, next, card.durationMin ?? 60, bufferMin),
  }
}

/**
 * Miejsca w kolumnie, do których można upuścić kartę: między kartami i za ostatnią, z godziną, jaką
 * dostałaby karta. Pokazywane podczas przeciągania, żeby było widać, gdzie wyląduje.
 */
export function dropSlots(
  column: DropColumn,
  card: { id: string; time?: string; durationMin?: number },
  bufferMin: number,
): { y: number; time?: string }[] {
  const others = column.cards.filter((c) => c.id !== card.id)
  const x = column.x + column.w / 2
  const points = [
    ...(others.length ? [others[0] ? others[0].top - 1 : 0] : []),
    ...others.slice(0, -1).map((c, i) => (c.bottom + (others[i + 1] as DropCard).top) / 2),
    ...(others.length ? [(others.at(-1) as DropCard).bottom + 1] : []),
  ]
  return points.flatMap((y) => {
    const target = dropTarget({ x, y }, [column], card, bufferMin)
    return target?.kind === 'day' ? [{ y: target.y, time: target.time }] : []
  })
}

/**
 * Karty z datą w kolumny dni (po godzinie), od lewego górnego rogu obecnych kart z datą.
 * Karty bez daty, ramki i strzałki zostają. Zwraca poprzednie pozycje do jednego „cofnij”.
 */
export function arrangeByDays(
  doc: Y.Doc,
  cards: CardSnapshot[],
  trip: { startDate?: string | null; endDate?: string | null } = {},
): Positions {
  // Noclegi są belkami nad dniami — w kolumnach ich nie układamy.
  const dated = cards.filter((c) => !c.deletedAt && c.date && c.type !== 'stay')
  const previous: Positions = {}
  if (!dated.length) return previous

  const dates = [...new Set(dated.map((c) => c.date as string))].sort()
  const first =
    trip.startDate && trip.startDate < (dates[0] as string) ? trip.startDate : (dates[0] as string)
  const last = dates[dates.length - 1] as string
  const columns = dateRange(first, trip.endDate && trip.endDate > last ? trip.endDate : last)
  const originX = snapToGrid(Math.min(...dated.map((c) => c.x)))
  const originY = snapToGrid(Math.min(...dated.map((c) => c.y)))

  doc.transact(() => {
    for (const [col, date] of columns.entries()) {
      // Przypięte na górze kolumny, dalej wg godziny.
      const day = dated.filter((c) => c.date === date).sort(byDayPlace)
      let y = originY
      for (const card of day) {
        previous[card.id] = { x: card.x, y: card.y, frameId: card.frameId }
        const map = cardsOf(doc).get(card.id)
        map?.set('x', originX + col * (CARD_SIZE.w + DAY_GAP.x))
        map?.set('y', y)
        y += (card.h ?? CARD_SIZE.h) + DAY_GAP.y
      }
    }
    assignFrames(doc)
  })
  return previous
}

/** Przywraca pozycje zapisane przez arrangeByDays. */
export function restorePositions(doc: Y.Doc, positions: Positions) {
  doc.transact(() => {
    for (const [id, p] of Object.entries(positions)) {
      const card = cardsOf(doc).get(id)
      if (!card) continue
      card.set('x', p.x)
      card.set('y', p.y)
      if (p.frameId) card.set('frameId', p.frameId)
      else card.delete('frameId')
    }
  })
}

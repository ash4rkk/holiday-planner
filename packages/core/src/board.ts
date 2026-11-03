import { nanoid } from 'nanoid'
import * as Y from 'yjs'
import { CARD_SIZE, type CardSnapshot } from './cards'
import { dateRange } from './dates'
import { cardsOf } from './trip-doc'

// Tablica w dokumencie wyjazdu:
//   frames: Y.Map<frameId, Y.Map{ title, x, y, w, h }>   — ramki-grupy
//   edges:  Y.Map<edgeId, Y.Map{ from, to, label? }>     — strzałki między kartami
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
// „Ułóż wg dni”: odstęp kolumn mieści obrysy dni (web: DAY_PAD), a pionowy — strzałki kolejności.
const DAY_GAP = { x: 90, y: 56 }

export function framesOf(doc: Y.Doc): Y.Map<Y.Map<unknown>> {
  return doc.getMap<Y.Map<unknown>>('frames')
}

export function edgesOf(doc: Y.Doc): Y.Map<Y.Map<unknown>> {
  return doc.getMap<Y.Map<unknown>>('edges')
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
export function moveItems(doc: Y.Doc, moves: { cards?: Positions; frames?: Positions }) {
  doc.transact(() => {
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

/** Kolejność w dniu: po godzinie, bez godziny na początku, przy remisie wg utworzenia. */
function byTime(a: CardSnapshot, b: CardSnapshot): number {
  return (a.time ?? '').localeCompare(b.time ?? '') || a.createdAt.localeCompare(b.createdAt)
}

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

/**
 * Karty z datą w kolumny dni (po godzinie), od lewego górnego rogu obecnych kart z datą.
 * Karty bez daty, ramki i strzałki zostają. Zwraca poprzednie pozycje do jednego „cofnij”.
 */
export function arrangeByDays(
  doc: Y.Doc,
  cards: CardSnapshot[],
  trip: { startDate?: string | null; endDate?: string | null } = {},
): Positions {
  const dated = cards.filter((c) => !c.deletedAt && c.date)
  const previous: Positions = {}
  if (!dated.length) return previous

  const dates = [...new Set(dated.map((c) => c.date as string))].sort()
  const first =
    trip.startDate && trip.startDate < (dates[0] as string) ? trip.startDate : (dates[0] as string)
  const last = dates[dates.length - 1] as string
  const columns = dateRange(first, trip.endDate && trip.endDate > last ? trip.endDate : last)
  const originX = Math.min(...dated.map((c) => c.x))
  const originY = Math.min(...dated.map((c) => c.y))

  doc.transact(() => {
    for (const [col, date] of columns.entries()) {
      const day = dated.filter((c) => c.date === date).sort(byTime)
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

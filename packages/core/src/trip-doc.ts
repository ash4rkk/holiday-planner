import { nanoid } from 'nanoid'
import * as Y from 'yjs'
import {
  CARD_SIZE,
  type CardFields,
  type CardSnapshot,
  type CardType,
  type EditableCardFields,
  TRASH_DAYS,
} from './cards'
import { addDays, dateRange } from './dates'

// Dokument Yjs wyjazdu (docs/plan.md, „Dokument Yjs wyjazdu”):
//   cards:  Y.Map<cardId, Y.Map>  — pola CardFields + `content: Y.XmlFragment`
//   frames, edges — etap 2

export type CardMap = Y.Map<unknown>

export function cardsOf(doc: Y.Doc): Y.Map<CardMap> {
  return doc.getMap<CardMap>('cards')
}

export function contentOf(card: CardMap): Y.XmlFragment {
  return card.get('content') as Y.XmlFragment
}

/** Nowa karta; zwraca jej id. Pozycję na tablicy dostaje w siatce, żeby etap 2 miał co pokazać. */
export function createCard(
  doc: Y.Doc,
  init: { type: CardType } & Partial<EditableCardFields> & { x?: number; y?: number },
  now = new Date(),
  text?: string,
): string {
  const cards = cardsOf(doc)
  const id = nanoid(12)
  const n = cards.size
  const fields: CardFields = {
    x: (n % 4) * (CARD_SIZE.w + 40),
    y: Math.floor(n / 4) * (CARD_SIZE.h + 40),
    ...CARD_SIZE,
    attachmentIds: [],
    pinned: false,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...init,
  }
  doc.transact(() => {
    const card = new Y.Map<unknown>()
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) card.set(key, value)
    }
    card.set('content', new Y.XmlFragment())
    cards.set(id, card)
    // Treść dopiero po dołączeniu do dokumentu (odczyt typu przed tym Yjs zgłasza jako błąd).
    const content = card.get('content') as Y.XmlFragment
    for (const line of (text ?? '').split('\n').filter((l) => l.trim())) {
      const paragraph = new Y.XmlElement('paragraph')
      const t = new Y.XmlText()
      t.insert(0, line)
      paragraph.insert(0, [t])
      content.push([paragraph])
    }
  })
  return id
}

/** Zmienia pola karty; `undefined` usuwa pole (np. wyczyszczona data). */
export function updateCard(
  doc: Y.Doc,
  id: string,
  patch: Partial<EditableCardFields>,
  now = new Date(),
) {
  const card = cardsOf(doc).get(id)
  if (!card) return
  doc.transact(() => {
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined || value === '') card.delete(key)
      else card.set(key, value)
    }
    card.set('updatedAt', now.toISOString())
  })
}

export function trashCard(doc: Y.Doc, id: string, now = new Date()) {
  const card = cardsOf(doc).get(id)
  if (card) doc.transact(() => card.set('deletedAt', now.toISOString()))
}

export function restoreCard(doc: Y.Doc, id: string) {
  const card = cardsOf(doc).get(id)
  if (card) doc.transact(() => card.delete('deletedAt'))
}

/** Usuwa na stałe karty z kosza starsze niż 30 dni. Zwraca liczbę usuniętych. */
export function purgeTrash(doc: Y.Doc, now = new Date(), days = TRASH_DAYS): number {
  const cards = cardsOf(doc)
  const limit = now.getTime() - days * 86_400_000
  const stale = [...cards.entries()]
    .filter(([, c]) => {
      const deletedAt = c.get('deletedAt')
      return typeof deletedAt === 'string' && Date.parse(deletedAt) < limit
    })
    .map(([id]) => id)
  if (stale.length) {
    const edges = doc.getMap<Y.Map<unknown>>('edges')
    doc.transact(() => {
      for (const id of stale) cards.delete(id)
      for (const [edgeId, edge] of [...edges.entries()]) {
        if (
          stale.includes(edge.get('from') as string) ||
          stale.includes(edge.get('to') as string)
        ) {
          edges.delete(edgeId)
        }
      }
    })
  }
  return stale.length
}

// ---------- odczyt ----------

/** Linie tekstu treści: każdy blok z tekstem (akapit, nagłówek, punkt listy) to jedna linia. */
export function fragmentLines(fragment: Y.XmlFragment | Y.XmlElement): string[] {
  const lines: string[] = []
  const walk = (node: Y.XmlFragment | Y.XmlElement) => {
    let text = ''
    let hasText = false
    for (const child of node.toArray()) {
      if (child instanceof Y.XmlText) {
        hasText = true
        for (const op of child.toDelta() as { insert: unknown }[]) {
          if (typeof op.insert === 'string') text += op.insert
        }
      } else if (child instanceof Y.XmlElement) {
        if (child.nodeName === 'hardBreak') text += ' '
        else walk(child)
      }
    }
    if (hasText) lines.push(text.trim())
  }
  walk(fragment)
  return lines.filter(Boolean)
}

export function readCard(id: string, card: CardMap): CardSnapshot {
  const fields = Object.fromEntries(
    [...card.entries()].filter(([key]) => key !== 'content'),
  ) as CardFields
  const lines = fragmentLines(contentOf(card))
  const [title = '', ...rest] = lines
  const preview = rest.join(' · ')
  return {
    ...fields,
    attachmentIds: fields.attachmentIds ?? [],
    pinned: fields.pinned ?? false,
    id,
    title,
    preview: preview.length > 160 ? `${preview.slice(0, 159)}…` : preview,
  }
}

export function readCards(doc: Y.Doc): CardSnapshot[] {
  return [...cardsOf(doc).entries()].map(([id, card]) => readCard(id, card))
}

// ---------- Lista ----------

export type DayGroup = { date: string; dayIndex?: number; cards: CardSnapshot[] }
export type ListGroups = {
  pinned: CardSnapshot[]
  days: DayGroup[]
  undated: CardSnapshot[]
  trash: CardSnapshot[]
}

function byTimeThenCreated(a: CardSnapshot, b: CardSnapshot): number {
  // Karty bez godziny (na cały dzień) przed kartami z godziną.
  const ta = a.time ?? ''
  const tb = b.time ?? ''
  if (ta !== tb) return ta < tb ? -1 : 1
  return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0
}

/**
 * Grupy Listy: przypięte na górze, potem dni (wszystkie dni wyjazdu, także puste, plus dni spoza
 * zakresu, w których są karty), na końcu „bez daty”. Karty z kosza osobno.
 */
export function groupCardsByDay(
  cards: CardSnapshot[],
  trip: { startDate?: string | null; endDate?: string | null } = {},
): ListGroups {
  const live = cards.filter((c) => !c.deletedAt)
  const trash = cards
    .filter((c) => c.deletedAt)
    .sort((a, b) => ((a.deletedAt ?? '') < (b.deletedAt ?? '') ? 1 : -1))
  const pinned = live.filter((c) => c.pinned).sort(byTimeThenCreated)
  const rest = live.filter((c) => !c.pinned)

  const byDate = new Map<string, CardSnapshot[]>()
  if (trip.startDate) {
    for (const d of dateRange(trip.startDate, trip.endDate ?? trip.startDate)) byDate.set(d, [])
  }
  const undated: CardSnapshot[] = []
  for (const card of rest) {
    if (!card.date) {
      undated.push(card)
      continue
    }
    const list = byDate.get(card.date) ?? []
    list.push(card)
    byDate.set(card.date, list)
  }

  const days = [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, list]) => ({
      date,
      dayIndex: dayIndexOf(date, trip.startDate, trip.endDate),
      cards: list.sort(byTimeThenCreated),
    }))

  return { pinned, days, undated: undated.sort(byTimeThenCreated), trash }
}

/** Numer dnia wyjazdu (1 = pierwszy dzień) albo undefined poza zakresem. */
export function dayIndexOf(
  date: string,
  start?: string | null,
  end?: string | null,
): number | undefined {
  if (!start) return undefined
  const last = end ?? start
  if (date < start || date > last) return undefined
  return dateRange(start, date).length
}

/** Noc noclegu obejmuje dzień `date`, gdy date ∈ [start, endDate). */
export function staysOver(card: CardSnapshot, date: string): boolean {
  if (card.type !== 'stay' || !card.date) return false
  const end = card.endDate ?? addDays(card.date, 1)
  return card.date <= date && date < end
}

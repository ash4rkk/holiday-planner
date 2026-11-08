import { nanoid } from 'nanoid'
import * as Y from 'yjs'
import { parseAmounts, withoutAmounts } from './amounts'
import {
  byTime,
  CARD_SIZE,
  CARD_STATUSES,
  type CardFields,
  type CardSnapshot,
  type CardStatus,
  type CardType,
  type EditableCardFields,
  GRID,
  TRASH_DAYS,
} from './cards'
import { addDays, dateRange, daysBetween } from './dates'

// Dokument Yjs wyjazdu (docs/plan.md, „Dokument Yjs wyjazdu”):
//   cards:  Y.Map<cardId, Y.Map>  — pola CardFields + `content: Y.XmlFragment`
//   frames, edges — etap 2

export type CardMap = Y.Map<unknown>

const DAY_STACK_GAP = GRID * 3

/** Miejsce pod kartami danego dnia na Tablicy — inaczej obrys dnia rozjechałby się po całej planszy. */
function daySlot(doc: Y.Doc, date: string, except?: string): { x: number; y: number } | undefined {
  let slot: { x: number; y: number } | undefined
  for (const [id, card] of cardsOf(doc).entries()) {
    // Noclegi są belką nad dniami, nie miejscem w kolumnie.
    if (id === except || card.get('date') !== date || card.get('deletedAt')) continue
    if (card.get('type') === 'stay') continue
    const y = (card.get('y') as number) + ((card.get('h') as number) ?? CARD_SIZE.h) + DAY_STACK_GAP
    if (!slot || y > slot.y) slot = { x: card.get('x') as number, y }
  }
  return slot
}

/**
 * Przywraca kolejność godzin w kolumnie dnia. Zmienia tylko `y` i tylko wtedy, gdy kolejność się
 * rozjechała. Dzień ułożony ręcznie (karty w różnych miejscach albo w ramkach) zostaje bez zmian.
 */
function tidyDay(doc: Y.Doc, date: string) {
  const day = [...cardsOf(doc).values()]
    .filter((c) => c.get('date') === date && !c.get('deletedAt') && c.get('type') !== 'stay')
    .map((card) => ({
      card,
      time: card.get('time') as string | undefined,
      createdAt: card.get('createdAt') as string,
      x: card.get('x') as number,
      y: card.get('y') as number,
      h: (card.get('h') as number) ?? CARD_SIZE.h,
    }))
    .sort(byTime)
  const xs = day.map((c) => c.x)
  if (Math.max(...xs) - Math.min(...xs) >= CARD_SIZE.w / 2) return
  if (day.some((c) => c.card.get('frameId'))) return
  if (day.every((c, i) => !i || c.y > (day[i - 1] as (typeof day)[number]).y)) return

  let y = Math.min(...day.map((c) => c.y))
  for (const c of day) {
    c.card.set('y', y)
    y += c.h + DAY_STACK_GAP
  }
}

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
    ...(init.date && daySlot(doc, init.date)),
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
    if (init.date) tidyDay(doc, init.date)
  })
  return id
}

/** Dopisuje akapity na końcu treści karty (zatwierdzona zmiana od AI, np. link do biletów). */
export function appendCardText(doc: Y.Doc, id: string, text: string, now = new Date()) {
  const card = cardsOf(doc).get(id)
  if (!card) return
  doc.transact(() => {
    const content = contentOf(card)
    for (const line of text.split('\n').filter((l) => l.trim())) {
      const paragraph = new Y.XmlElement('paragraph')
      const t = new Y.XmlText()
      t.insert(0, line)
      paragraph.insert(0, [t])
      content.push([paragraph])
    }
    card.set('updatedAt', now.toISOString())
  })
}

/** Przenosi kartę na inny dzień; nocleg zachowuje długość. `undefined` = karta bez daty. */
export function moveCardToDay(doc: Y.Doc, id: string, date: string | undefined) {
  const card = cardsOf(doc).get(id)
  if (!card) return
  const from = card.get('date') as string | undefined
  const end = card.get('endDate') as string | undefined
  const endDate = date && from && end ? addDays(date, daysBetween(from, end)) : undefined
  updateCard(doc, id, { date, endDate })
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
    const slot = patch.date && patch.date !== card.get('date') && daySlot(doc, patch.date, id)
    const timeBefore = card.get('time')
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined || value === '') card.delete(key)
      else card.set(key, value)
    }
    if (slot) {
      card.set('x', slot.x)
      card.set('y', slot.y)
    }
    const date = card.get('date') as string | undefined
    if (date && (slot || card.get('time') !== timeBefore)) tidyDay(doc, date)
    card.set('updatedAt', now.toISOString())
  })
}

export function trashCard(doc: Y.Doc, id: string, now = new Date()) {
  const card = cardsOf(doc).get(id)
  if (!card) return
  doc.transact(() => {
    // Karta główna w koszu: miejsce w planie przejmuje najstarszy wariant, a po przywróceniu
    // wyrzucona karta wraca do stosu jako wariant.
    const heir = variantIds(doc, id)[0]
    if (heir) promote(doc, heir, id)
    card.set('deletedAt', now.toISOString())
  })
}

export function restoreCard(doc: Y.Doc, id: string) {
  const card = cardsOf(doc).get(id)
  if (card) doc.transact(() => card.delete('deletedAt'))
}

/**
 * Robi zmianę planu (karty, ramki, strzałki) jako jedną transakcję i zwraca jej cofnięcie (pasek „cofnij”). Cofa tylko tę
 * zmianę, nie zmiany drugiej osoby. `dispose` zwalnia nasłuch, gdy cofnięcia już nie będzie.
 */
export function undoable(
  doc: Y.Doc,
  change: () => void,
): { undo: () => void; dispose: () => void } {
  const origin = Symbol('undoable')
  // Karty, ramki i strzałki: usunięcie ramki zmienia też karty, które w niej leżały.
  const scope = [cardsOf(doc), doc.getMap('frames'), doc.getMap('edges')]
  const manager = new Y.UndoManager(scope, {
    trackedOrigins: new Set([origin]),
    captureTimeout: 0,
  })
  doc.transact(change, origin)
  let done = false
  const dispose = () => {
    if (done) return
    done = true
    manager.destroy()
  }
  return {
    undo: () => {
      if (done) return
      manager.undo()
      dispose()
    },
    dispose,
  }
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

/** Stare karty: „zaliczone” to rzecz załatwiona, a status „pomysł” już nie istnieje. */
function currentStatus(status: string | undefined): CardStatus | undefined {
  if (status === 'done') return 'booked'
  return CARD_STATUSES.find((s) => s === status)
}

export function readCard(id: string, card: CardMap): CardSnapshot {
  const fields = Object.fromEntries(
    [...card.entries()].filter(([key]) => key !== 'content'),
  ) as CardFields
  const lines = fragmentLines(contentOf(card))
  const [title = '', ...rest] = lines
  const preview = rest.map(withoutAmounts).filter(Boolean).join(' · ')
  return {
    ...fields,
    status: currentStatus(fields.status as string | undefined),
    attachmentIds: fields.attachmentIds ?? [],
    pinned: fields.pinned ?? false,
    id,
    title,
    preview: preview.length > 160 ? `${preview.slice(0, 159)}…` : preview,
    amounts: parseAmounts(lines.join('\n')),
  }
}

export function readCards(doc: Y.Doc): CardSnapshot[] {
  const cards = [...cardsOf(doc).entries()].map(([id, card]) => readCard(id, card))
  // Wariant bez żywej karty głównej (np. po równoczesnych zmianach) wraca do pomysłów, nie znika.
  const mains = new Set(cards.filter((c) => !c.deletedAt && !c.variantOf).map((c) => c.id))
  return cards.map((c) =>
    c.variantOf && !mains.has(c.variantOf) ? { ...c, variantOf: undefined } : c,
  )
}

// ---------- warianty ----------

/** Żywe warianty karty, od najstarszego. */
function variantIds(doc: Y.Doc, mainId: string): string[] {
  return [...cardsOf(doc).entries()]
    .filter(([, c]) => c.get('variantOf') === mainId && !c.get('deletedAt'))
    .sort(([, a], [, b]) =>
      (a.get('createdAt') as string).localeCompare(b.get('createdAt') as string),
    )
    .map(([id]) => id)
}

/** Wariant zajmuje miejsce karty głównej w planie, a ona i reszta stają się jego wariantami. */
function promote(doc: Y.Doc, id: string, mainId: string) {
  const card = cardsOf(doc).get(id)
  const main = cardsOf(doc).get(mainId)
  if (!card || !main) return
  for (const key of ['date', 'endDate', 'frameId', 'x', 'y']) {
    if (main.has(key)) card.set(key, main.get(key))
    else card.delete(key)
  }
  for (const key of ['date', 'endDate', 'frameId', 'variantChosen']) main.delete(key)
  for (const other of cardsOf(doc).values()) {
    if (other.get('variantOf') === mainId) other.set('variantOf', id)
  }
  main.set('variantOf', id)
  card.delete('variantOf')
}

/** Karta staje się wariantem innej: traci dzień, a jej własne warianty idą razem z nią. */
export function addVariant(doc: Y.Doc, id: string, target: string, now = new Date()) {
  const cards = cardsOf(doc)
  const mainId = (cards.get(target)?.get('variantOf') as string | undefined) ?? target
  const card = cards.get(id)
  const main = cards.get(mainId)
  if (!card || !main || id === mainId) return
  doc.transact(() => {
    for (const other of cards.values()) {
      if (other.get('variantOf') === id) other.set('variantOf', mainId)
    }
    for (const key of ['date', 'endDate', 'frameId', 'variantChosen']) card.delete(key)
    if (!card.get('time') && main.get('time')) card.set('time', main.get('time'))
    card.set('variantOf', mainId)
    card.set('updatedAt', now.toISOString())
    // Nowa opcja znów otwiera wybór.
    main.delete('variantChosen')
  })
}

/** Wybór: karta przejmuje miejsce w planie, a kolumna dnia układa się wg jej godziny. */
export function chooseVariant(doc: Y.Doc, id: string, now = new Date()) {
  const card = cardsOf(doc).get(id)
  if (!card) return
  doc.transact(() => {
    const mainId = card.get('variantOf') as string | undefined
    if (mainId) promote(doc, id, mainId)
    card.set('variantChosen', true)
    card.set('updatedAt', now.toISOString())
    const date = card.get('date') as string | undefined
    if (date) tidyDay(doc, date)
  })
}

/**
 * „Do pomysłów”: karta bez dnia, nieprzypięta i poza ramką (inaczej nie trafi do drawera); wariant
 * wychodzi ze stosu.
 */
export function moveToIdeas(doc: Y.Doc, id: string, now = new Date()) {
  const card = cardsOf(doc).get(id)
  if (!card) return
  doc.transact(() => {
    if (card.get('variantOf')) detachVariant(doc, id, now)
    else moveCardToDay(doc, id, undefined)
    for (const key of ['pinned', 'frameId', 'aiDraft', 'skipped']) card.delete(key)
    card.set('updatedAt', now.toISOString())
  })
}

/** Wyjmuje wariant ze stosu: wraca do pomysłów. */
export function detachVariant(doc: Y.Doc, id: string, now = new Date()) {
  const card = cardsOf(doc).get(id)
  const mainId = card?.get('variantOf') as string | undefined
  if (!card || !mainId) return
  doc.transact(() => {
    card.delete('variantOf')
    card.set('updatedAt', now.toISOString())
    if (!variantIds(doc, mainId).length) cardsOf(doc).get(mainId)?.delete('variantChosen')
  })
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
  // Warianty nie są punktami planu; widać je przy karcie głównej.
  const live = cards.filter((c) => !c.deletedAt && !c.variantOf)
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

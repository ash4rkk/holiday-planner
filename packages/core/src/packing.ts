import { nanoid } from 'nanoid'
import * as Y from 'yjs'
import { daysBetween } from './dates'

// Lista pakowania wyjazdu: mapa `packing` w dokumencie Yjs — wspólna dla obu osób i offline.

export const PACKING_CATEGORIES = [
  'dokumenty',
  'ubrania',
  'kosmetyki',
  'elektronika',
  'apteczka',
  'inne',
] as const
export type PackingCategory = (typeof PACKING_CATEGORIES)[number]

export type PackingItem = {
  id: string
  text: string
  category: PackingCategory
  /** Imię osoby, która to bierze; brak = wspólne. */
  owner?: string
  packed: boolean
  createdAt: string
}

/** Ile dni przed wyjazdem „dziś” pokazuje pasek listy pakowania (ustawienie wspólne). */
export const DEFAULT_PACKING_DAYS = 3
export const MAX_PACKING_DAYS = 14

/** Pasek w „dziś”: tylko przed pierwszym dniem i nie wcześniej niż `days` dni przed; 0 = nigdy. */
export function showPackingBar(today: string, startDate: string | null, days: number): boolean {
  if (!startDate || days <= 0) return false
  const left = daysBetween(today, startDate)
  return left > 0 && left <= days
}

export function packingOf(doc: Y.Doc): Y.Map<Y.Map<unknown>> {
  return doc.getMap<Y.Map<unknown>>('packing')
}

export function addPackingItem(
  doc: Y.Doc,
  item: { text: string; category?: PackingCategory; owner?: string },
  now = new Date(),
): string {
  const id = nanoid(10)
  const map = new Y.Map<unknown>()
  doc.transact(() => {
    map.set('text', item.text.trim())
    map.set('category', item.category ?? 'inne')
    if (item.owner) map.set('owner', item.owner)
    map.set('packed', false)
    map.set('createdAt', now.toISOString())
    packingOf(doc).set(id, map)
  })
  return id
}

export function updatePackingItem(
  doc: Y.Doc,
  id: string,
  patch: Partial<Pick<PackingItem, 'text' | 'category' | 'owner' | 'packed'>>,
) {
  const item = packingOf(doc).get(id)
  if (!item) return
  doc.transact(() => {
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined || value === '') item.delete(key)
      else item.set(key, value)
    }
  })
}

export function removePackingItem(doc: Y.Doc, id: string) {
  packingOf(doc).delete(id)
}

/** Pozycje po kategorii (kolejność z listy kategorii), w kategorii od najstarszej. */
export function readPacking(doc: Y.Doc): PackingItem[] {
  const order = (c: string) => {
    const i = PACKING_CATEGORIES.indexOf(c as PackingCategory)
    return i === -1 ? PACKING_CATEGORIES.length : i
  }
  return [...packingOf(doc).entries()]
    .map(([id, m]) => ({
      id,
      text: (m.get('text') as string) ?? '',
      category: ((m.get('category') as PackingCategory) ?? 'inne') as PackingCategory,
      owner: m.get('owner') as string | undefined,
      packed: m.get('packed') === true,
      createdAt: (m.get('createdAt') as string) ?? '',
    }))
    .sort((a, b) => order(a.category) - order(b.category) || a.createdAt.localeCompare(b.createdAt))
}

/** Kopia listy z innego wyjazdu: te same rzeczy i osoby, nic nie spakowane; bez powtórzeń. */
export function copyPacking(doc: Y.Doc, items: PackingItem[], now = new Date()): number {
  const have = new Set(readPacking(doc).map((i) => i.text.toLowerCase()))
  let added = 0
  doc.transact(() => {
    for (const item of items) {
      if (!item.text || have.has(item.text.toLowerCase())) continue
      have.add(item.text.toLowerCase())
      addPackingItem(doc, item, now)
      added++
    }
  })
  return added
}

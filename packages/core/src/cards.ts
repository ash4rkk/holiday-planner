import type { Amount } from './amounts'

export const CARD_TYPES = ['stay', 'sight', 'food', 'transport', 'note'] as const
export type CardType = (typeof CARD_TYPES)[number]

export const CARD_TYPE_LABELS: Record<CardType, string> = {
  stay: 'nocleg',
  sight: 'atrakcja',
  food: 'jedzenie',
  transport: 'transport',
  note: 'notatka',
}

// Brak statusu też jest poprawny: karta nie wymaga niczego załatwiać.
export const CARD_STATUSES = ['missing', 'booked'] as const
export type CardStatus = (typeof CARD_STATUSES)[number]

export const CARD_STATUS_LABELS: Record<CardStatus, string> = {
  missing: 'do rezerwacji',
  booked: 'zarezerwowane',
}

export type CardLocation = {
  name: string
  address?: string
  lat?: number
  lng?: number
  mapsUrl?: string
}

/** Podgląd linku (Open Graph) dla kart z wklejonego adresu. */
export type LinkPreview = {
  url: string
  title?: string
  description?: string
  image?: string
  siteName?: string
}

/** Pola karty trzymane w Y.Map (poza treścią, która jest Y.XmlFragment pod kluczem `content`). */
export type CardFields = {
  type: CardType
  x: number
  y: number
  w: number
  h: number
  frameId?: string
  date?: string // '2027-07-14'
  endDate?: string // noclegi, wynajem
  time?: string // '14:30'
  durationMin?: number
  remindMin?: number
  status?: CardStatus
  location?: CardLocation
  /** Transport: dokąd jedzie (location to miejsce startu). */
  destination?: CardLocation
  linkPreview?: LinkPreview
  attachmentIds: string[]
  pinned: boolean
  templateId?: string
  aiDraft?: boolean
  createdAt: string
  updatedAt: string
  deletedAt?: string // kosz: przywracanie przez 30 dni
  /** Wariant: id karty głównej. Wariant nie ma daty, więc plan dnia liczy tylko kartę główną. */
  variantOf?: string
  /** Karta główna: wybrana świadomie spośród wariantów, a nie tylko pierwsza z nich. */
  variantChosen?: boolean
}

/** Pola, które użytkownik zmienia w edytorze karty. */
export type EditableCardFields = Pick<
  CardFields,
  | 'type'
  | 'date'
  | 'endDate'
  | 'time'
  | 'durationMin'
  | 'remindMin'
  | 'status'
  | 'location'
  | 'destination'
  | 'linkPreview'
  | 'templateId'
  | 'aiDraft'
  | 'pinned'
>

export type CardSnapshot = CardFields & {
  id: string
  /** Pierwsza niepusta linia treści. */
  title: string
  /** Kolejne linie treści, skrócone. */
  preview: string
  /** Kwoty `/+` z całej treści. */
  amounts: Amount[]
}

export const CARD_SIZE = { w: 260, h: 160 } as const
/** Oczko siatki Tablicy; karta i odstępy dni są jego wielokrotnością. */
export const GRID = 20

export function snapToGrid(value: number): number {
  return Math.round(value / GRID) * GRID
}

/** Pomysł: karta bez dnia, która czeka w drawerze. Przypięte, ramki i szkice AI zostają na Tablicy. */
export function isIdea(c: CardSnapshot): boolean {
  return !c.deletedAt && !c.date && !c.variantOf && !c.pinned && !c.frameId && !c.aiDraft
}

/** Warianty wg karty głównej, od najstarszego. */
export function variantsByMain(cards: CardSnapshot[]): Map<string, CardSnapshot[]> {
  const byMain = new Map<string, CardSnapshot[]>()
  for (const c of cards) {
    if (!c.variantOf || c.deletedAt) continue
    byMain.set(c.variantOf, [...(byMain.get(c.variantOf) ?? []), c])
  }
  for (const list of byMain.values()) list.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  return byMain
}

/** Kolejność w dniu: po godzinie, bez godziny na początku, przy remisie wg utworzenia. */
export function byTime(
  a: Pick<CardFields, 'time' | 'createdAt'>,
  b: Pick<CardFields, 'time' | 'createdAt'>,
): number {
  return (a.time ?? '').localeCompare(b.time ?? '') || a.createdAt.localeCompare(b.createdAt)
}

export const TRASH_DAYS = 30

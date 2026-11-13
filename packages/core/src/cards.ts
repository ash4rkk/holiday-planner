import type { Amount } from './amounts'
import { daysBetween, formatShortDate } from './dates'
import type { TravelMode } from './route-plan'

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
  /**
   * Transport: godzina przyjazdu, lokalna jak na bilecie (strefa czasowa celu). Przyjazd innego
   * dnia (nocny pociąg) — z `endDate`.
   */
  endTime?: string
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
  /**
   * Pominięta („pomiń”): zostaje w dniu, ale przekreślona — bez dojazdów, przypomnień i w sumach
   * wydatków jej nie liczymy.
   */
  skipped?: boolean
  /** Jak dojechać na tę kartę (nocleg: powrót wieczorem); bez pola = tryb całego wyjazdu. */
  arriveMode?: TravelMode
  /** Ile minut przed godziną karty trzeba być na miejscu (lot, pociąg); bez pola = domyślnie wg typu. */
  arriveEarlyMin?: number
}

/** Pola, które użytkownik zmienia w edytorze karty. */
export type EditableCardFields = Pick<
  CardFields,
  | 'type'
  | 'date'
  | 'endDate'
  | 'time'
  | 'endTime'
  | 'durationMin'
  | 'remindMin'
  | 'status'
  | 'location'
  | 'destination'
  | 'linkPreview'
  | 'templateId'
  | 'aiDraft'
  | 'pinned'
  | 'skipped'
  | 'arriveMode'
  | 'arriveEarlyMin'
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

/**
 * Nocleg z datą na Tablicy: nie stoi w kolumnie dnia, tylko jako belka nad dniami, które obejmuje
 * (od zameldowania do ostatniej nocy).
 */
export function isBandStay(
  c: Pick<CardSnapshot, 'type' | 'date' | 'variantOf' | 'deletedAt'>,
): boolean {
  return c.type === 'stay' && Boolean(c.date) && !c.variantOf && !c.deletedAt
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

/**
 * Miejsce w kolumnie dnia: przypięte na górze (ważne na cały dzień, np. bilety), dalej wg godziny.
 * Plan dnia, dojazdy i linia „teraz” liczą się dalej wg godziny (`byTime`).
 */
export function byDayPlace(
  a: Pick<CardFields, 'time' | 'createdAt'> & { pinned?: boolean },
  b: Pick<CardFields, 'time' | 'createdAt'> & { pinned?: boolean },
): number {
  if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1
  return byTime(a, b)
}

export const TRASH_DAYS = 30

const clockMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))

/**
 * Ile minut trwa karta: transport z przyjazdem — od odjazdu do przyjazdu (zegary lokalne, tak jak
 * plan dnia), inaczej `durationMin`. Przyjazd „wcześniej” niż odjazd bez `endDate` to następny dzień.
 */
export function spanMin(
  card: Pick<CardFields, 'date' | 'endDate' | 'time' | 'durationMin'> &
    Partial<Pick<CardFields, 'type' | 'endTime'>>,
): number | undefined {
  if (card.type === 'transport' && card.time && card.endTime) {
    const days = card.date && card.endDate ? Math.max(0, daysBetween(card.date, card.endDate)) : 0
    let span = days * 1440 + clockMin(card.endTime) - clockMin(card.time)
    if (span <= 0 && !days) span += 1440
    if (span > 0) return span
  }
  return card.durationMin
}

/** Przyjazd do wyświetlenia: '19:49', a innego dnia '07:05 (27 gru)'. */
export function arrivalLabel(
  card: Pick<CardFields, 'type' | 'date' | 'endDate' | 'endTime'>,
): string | undefined {
  if (card.type !== 'transport' || !card.endTime) return undefined
  const otherDay = card.endDate && card.endDate !== card.date
  return otherDay ? `${card.endTime} (${formatShortDate(card.endDate as string)})` : card.endTime
}

/** Miejsce do wiersza karty: transport jako „start → cel”, inne karty — nazwa miejsca. */
export function placeLine(
  card: Pick<CardFields, 'type' | 'location' | 'destination'>,
): string | undefined {
  const from = card.location?.name?.trim()
  const to = card.type === 'transport' ? card.destination?.name?.trim() : undefined
  if (from && to) return `${from} → ${to}`
  return to ? `→ ${to}` : from || undefined
}

const TIME = '([01]?\\d|2[0-3])[:.]([0-5]\\d)'
const pad = (h: string, m: string) => `${h.padStart(2, '0')}:${m}`

/**
 * Godzina przyjazdu z tekstu biletu, gdy AI zostawiło ją tylko w opisie: „08:54 → 19:49”,
 * „08:54 - 19:49”, „przyjazd: 19:49”, „przylot 19:49”, „arrival 19:49”. Bez dopasowania — undefined.
 */
export function arrivalFromText(text: string): string | undefined {
  // Najpierw para „odjazd → przyjazd” (etykieta „odjazd / przyjazd” stoi przed obiema godzinami).
  const span = text.match(new RegExp(`${TIME}\\s*(?:→|->|–|—|-)\\s*${TIME}`))
  if (span) return pad(span[3] as string, span[4] as string)
  const label = text.match(new RegExp(`(?:przyjazd|przylot|arrival|arr\\.?)\\D{0,12}?${TIME}`, 'i'))
  if (label) return pad(label[1] as string, label[2] as string)
  return undefined
}

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
export const CARD_STATUSES = ['idea', 'booked', 'missing'] as const
export type CardStatus = (typeof CARD_STATUSES)[number]

export const CARD_STATUS_LABELS: Record<CardStatus, string> = {
  idea: 'pomysł',
  booked: 'ogarnięte',
  missing: 'do ogarnięcia',
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
export const TRASH_DAYS = 30

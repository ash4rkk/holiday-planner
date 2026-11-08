import type { AttachmentMeta } from './attachments'
import type { CardSnapshot } from './cards'
import { addDays } from './dates'

export type TicketItem = { card: CardSnapshot; files: AttachmentMeta[] }
export type TicketDay = { date: string; items: TicketItem[] }

/**
 * Bilety dni od `start`: karty dnia z plikami (bilety, karty pokładowe, rezerwacje), po godzinie.
 * Pomija kosz, warianty i karty pominięte; nocleg liczy się w dniu przyjazdu.
 */
export function dayTickets(
  cards: CardSnapshot[],
  attachments: AttachmentMeta[],
  start: string,
  days = 3,
): TicketDay[] {
  const byCard = new Map<string, AttachmentMeta[]>()
  for (const a of [...attachments].sort((x, y) => x.createdAt.localeCompare(y.createdAt)))
    byCard.set(a.cardId, [...(byCard.get(a.cardId) ?? []), a])
  return Array.from({ length: days }, (_, i) => addDays(start, i)).map((date) => ({
    date,
    items: cards
      .filter((c) => c.date === date && !c.deletedAt && !c.variantOf && !c.skipped)
      .filter((c) => byCard.has(c.id))
      .sort((a, b) => (a.time ?? '99').localeCompare(b.time ?? '99'))
      .map((card) => ({ card, files: byCard.get(card.id) as AttachmentMeta[] })),
  }))
}

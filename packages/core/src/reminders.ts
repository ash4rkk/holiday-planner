import type { CardSnapshot, CardType } from './cards'

// Przypomnienia z kart: data + godzina (czas lokalny miejsca wyjazdu) − wyprzedzenie.
// Tylko po stronie serwera (Temporal w Node 26; przeglądarki go jeszcze nie mają wszędzie).

/** Wyprzedzenie przypomnienia w minutach wg typu karty; brak typu = bez przypomnienia. */
export type ReminderDefaults = Partial<Record<CardType, number>>

/**
 * Domyślne wyprzedzenie wg typu, gdy karta nie ma własnego; notatki bez przypomnień. Ustawienia
 * aplikacji (`app_settings`, klucz `reminders`) mogą je zmienić.
 */
export const DEFAULT_REMIND_MIN: ReminderDefaults = {
  transport: 180,
  stay: 120,
  sight: 60,
  food: 60,
}

export type ReminderRow = { cardId: string; fireAt: Date; title: string; body: string }

function before(min: number): string {
  if (min >= 1440 && min % 1440 === 0) return min === 1440 ? 'jutro' : `za ${min / 1440} dni`
  const h = Math.floor(min / 60)
  const m = min % 60
  return `za ${h ? `${h} h` : ''}${h && m ? ' ' : ''}${m ? `${m} min` : ''}`
}

export function computeReminders(
  cards: CardSnapshot[],
  tripTitle: string,
  timezone: string,
  defaults: ReminderDefaults = DEFAULT_REMIND_MIN,
): ReminderRow[] {
  const out: ReminderRow[] = []
  for (const card of cards) {
    if (card.deletedAt || card.skipped || !card.date || !card.time) continue
    const remind = card.remindMin ?? defaults[card.type]
    if (!remind) continue
    let start: Temporal.ZonedDateTime
    try {
      start = Temporal.PlainDateTime.from(`${card.date}T${card.time}`).toZonedDateTime(timezone)
    } catch {
      continue // zła data/godzina albo nieznana strefa
    }
    out.push({
      cardId: card.id,
      fireAt: new Date(start.subtract({ minutes: remind }).epochMilliseconds),
      title: card.title || 'karta bez tytułu',
      body: [
        `${before(remind)} · ${card.time}`,
        card.location?.name && `⌖ ${card.location.name}`,
        tripTitle,
      ]
        .filter(Boolean)
        .join(' · '),
    })
  }
  return out
}

/** Odcisk kart do wykrywania, co zmieniła druga osoba (treść, pola, kosz). */
export function cardsDigest(cards: CardSnapshot[]): Map<string, string> {
  return new Map(
    cards.map((c) => [
      c.id,
      JSON.stringify([
        c.title,
        c.preview,
        c.type,
        c.date,
        c.endDate,
        c.time,
        c.status,
        c.location?.name,
        c.deletedAt,
      ]),
    ]),
  )
}

/** Tytuły kart zmienionych między dwoma odciskami (nowe, zmienione, usunięte). */
export function changedTitles(
  before: Map<string, string>,
  after: Map<string, string>,
  cards: CardSnapshot[],
): string[] {
  const ids = new Set<string>()
  for (const [id, digest] of after) if (before.get(id) !== digest) ids.add(id)
  for (const id of before.keys()) if (!after.has(id)) ids.add(id)
  const titles = new Map(cards.map((c) => [c.id, c.title || 'karta bez tytułu']))
  return [...ids].map((id) => titles.get(id) ?? 'usunięta karta')
}

export function changesBody(titles: string[]): string {
  if (titles.length <= 3) return titles.join(', ')
  return `${titles.slice(0, 2).join(', ')} i ${titles.length - 2} inne`
}

import type { CardSnapshot } from './cards'
import { hasCoords, type MappedCard } from './maps'

const minutes = (hhmm: string) => {
  const [h = 0, m = 0] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/**
 * Następne miejsce dnia na Pulpicie: najbliższe z godziną (z 15 min zapasu wstecz — „właśnie
 * wychodzimy”), a bez takich pierwsze bez godziny. Pomija noclegi.
 */
export function nextPlace(
  cards: CardSnapshot[],
  today: string,
  now: string,
): MappedCard | undefined {
  const day = cards
    .filter((c) => !c.deletedAt && c.date === today && c.type !== 'stay')
    .filter(hasCoords)
  const timed = day
    .filter((c) => c.time && minutes(c.time) >= minutes(now) - 15)
    .sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''))
  return timed[0] ?? day.find((c) => !c.time)
}

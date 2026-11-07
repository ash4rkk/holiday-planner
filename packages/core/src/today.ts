import type { CardSnapshot } from './cards'
import { hasCoords, type LatLng, type MappedCard } from './maps'
import { staysOver } from './trip-doc'

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

/** Miejsce dla pogody danego dnia: nocleg tej nocy, pierwsze miejsce dnia, jakiekolwiek miejsce wyjazdu. */
export function weatherPlace(cards: CardSnapshot[], date: string): LatLng | undefined {
  const live = cards.filter((c) => !c.deletedAt).filter(hasCoords)
  const pick =
    live.find((c) => staysOver(c, date)) ??
    live.find((c) => c.date === date) ??
    live.find((c) => c.type === 'stay') ??
    live[0]
  return pick ? { lat: pick.location.lat, lng: pick.location.lng } : undefined
}

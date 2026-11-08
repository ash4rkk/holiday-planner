import { addDays, type CardSnapshot, dateRange, formatShortDate } from '@planer/core'

type TripDates = { startDate?: string | null; endDate?: string | null }

/**
 * Podpowiedzi na pusty czat zależne od chwili: przed wyjazdem braki i rezerwacje, w trakcie dziś
 * i jutro (z najbliższym przejazdem i wolnym dniem), po wyjeździe podsumowanie.
 */
export function chatSuggestions(trip: TripDates, cards: CardSnapshot[], today: string): string[] {
  const live = cards.filter((c) => !c.deletedAt && !c.variantOf)
  const start = trip.startDate
  const end = trip.endDate ?? start
  if (!start || !end)
    return ['zaproponuj plan na 3 dni', 'czego brakuje w planie?', 'co warto zobaczyć?']
  if (today > end)
    return ['ile wydaliśmy łącznie?', 'podsumuj wyjazd', 'ile wydaliśmy na jedzenie?']

  const days = dateRange(today < start ? start : today, end)
  const free = days.find((d) => !live.some((c) => c.date === d))
  const freeDay =
    free && `co robić ${free === today ? 'dziś' : formatShortDate(free)}? ten dzień jest wolny`
  const booking = live.some((c) => c.status === 'missing') && 'co trzeba jeszcze zarezerwować?'

  if (today < start)
    return [
      'czego brakuje w planie?',
      booking || 'co warto zarezerwować wcześniej?',
      freeDay,
      'ile wydamy łącznie?',
    ].filter((s): s is string => Boolean(s))

  const tomorrow = addDays(today, 1)
  const ride = live
    .filter((c) => c.type === 'transport' && (c.date === today || c.date === tomorrow) && c.title)
    .sort((a, b) => `${a.date}${a.time ?? ''}`.localeCompare(`${b.date}${b.time ?? ''}`))[0]
  return [
    'co mamy dziś?',
    today < end ? 'co mamy jutro?' : 'co zostało na ostatni dzień?',
    ride && `czy zdążymy na: ${ride.title}?`,
    freeDay ?? 'zaproponuj coś na wolne popołudnie',
    'gdzie zjeść w pobliżu?',
    booking,
  ]
    .filter((s): s is string => Boolean(s))
    .slice(0, 5)
}

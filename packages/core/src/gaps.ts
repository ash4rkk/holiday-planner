import type { CardLocation, CardSnapshot } from './cards'
import { addDays } from './dates'
import { hasCoords, type LatLng } from './maps'
import { staysOver } from './trip-doc'

// Przerwy między kartami dnia: czy się nakładają i czy jest sens sprawdzać dojazd.

export type DayGap = {
  /** Stałe id odcinka; `start` i `end` to dojazd z noclegu i powrót. */
  id: string
  kind: 'start' | 'between' | 'end'
  from?: string
  to?: string
  /** Minuty między końcem jednej a startem drugiej karty; ujemne = nakładają się. */
  freeMin?: number
  /** Koniec pierwszej karty (HH:MM) — wcześniej nie wyjdziecie. */
  leaveAt?: string
  /** Start następnej karty (HH:MM) — wtedy trzeba być na miejscu. */
  arriveBy?: string
  /** Skąd dokąd, gdy obie karty mają miejsce i dojazd ma sens. */
  route?: { from: LatLng; to: LatLng }
}

const minutes = (time: string) => {
  const [h = 0, m = 0] = time.split(':').map(Number)
  return h * 60 + m
}
const clock = (total: number) =>
  `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`

const point = (l?: CardLocation): LatLng | undefined =>
  l?.lat !== undefined && l.lng !== undefined ? { lat: l.lat, lng: l.lng } : undefined

/** Skąd rusza się po karcie: po transporcie z jego celu, inaczej z miejsca karty. */
const departurePoint = (c: CardSnapshot) =>
  c.type === 'transport' ? point(c.destination) : point(c.location)

const timedCards = (cards: CardSnapshot[]) =>
  cards
    .filter((c) => c.time && c.type !== 'stay' && !c.deletedAt)
    .sort((a, b) => (a.time as string).localeCompare(b.time as string))

const endOf = (c: CardSnapshot) => minutes(c.time as string) + (c.durationMin ?? 0)

/**
 * Pary kolejnych kart dnia z godziną. Noclegi pomijamy (trwają kilka dni). Lot czy pociąg bez pola
 * „dokąd” ma tylko miejsce startu, więc po nim zostaje samo nakładanie się.
 * Brak czasu trwania = 0 minut, czyli ostrzeżenie tylko przy naprawdę niemożliwym układzie.
 */
export function dayGaps(cards: CardSnapshot[]): DayGap[] {
  const timed = timedCards(cards)
  return timed.slice(1).map((to, i) => {
    const from = timed[i] as CardSnapshot
    const end = endOf(from)
    const gap: DayGap = {
      id: `${from.id}>${to.id}`,
      kind: 'between',
      from: from.id,
      to: to.id,
      freeMin: minutes(to.time as string) - end,
      leaveAt: clock(end),
      arriveBy: to.time,
    }
    const start = departurePoint(from)
    const stop = point(to.location)
    if (start && stop) gap.route = { from: start, to: stop }
    return gap
  })
}

/** Odcinki całego dnia: z noclegu do pierwszej karty, między kartami, powrót do noclegu. */
export function dayLegs(cards: CardSnapshot[], date: string): DayGap[] {
  const live = cards.filter((c) => !c.deletedAt)
  const day = live.filter((c) => c.date === date)
  const timed = timedCards(day)
  const legs = dayGaps(day)
  const stays = live.filter((c) => c.type === 'stay' && hasCoords(c))
  const morning = stays.find((s) => staysOver(s, addDays(date, -1)))
  const night = stays.find((s) => staysOver(s, date))
  const first = timed[0]
  const last = timed.at(-1)

  const home = point(morning?.location)
  const firstStop = point(first?.location)
  if (first && home && firstStop)
    legs.unshift({
      id: `start>${first.id}`,
      kind: 'start',
      to: first.id,
      arriveBy: first.time,
      route: { from: home, to: firstStop },
    })
  const bed = point(night?.location)
  const lastStop = last && departurePoint(last)
  if (last && bed && lastStop)
    legs.push({
      id: `${last.id}>end`,
      kind: 'end',
      from: last.id,
      leaveAt: clock(endOf(last)),
      route: { from: lastStop, to: bed },
    })
  return legs
}

/** Godzina przesunięta o minuty (HH:MM). */
export function shiftClock(time: string, delta: number): string {
  return clock((minutes(time) + delta + 1440) % 1440)
}

/** Kiedy będziecie na miejscu, ruszając teraz: z odjazdu z rozkładu albo od razu. */
export function arrivalClock(plan: { minutes: number; departAt?: string }, now: string): string {
  return shiftClock(plan.departAt ?? now, plan.minutes)
}

/** Spóźnienie wobec godziny karty; ujemne = zapas. Różnice ponad pół doby to przejście przez północ. */
export function lateBy(arrival: string, cardTime: string): number {
  const diff = minutes(arrival) - minutes(cardTime)
  if (diff > 720) return diff - 1440
  if (diff < -720) return diff + 1440
  return diff
}

/** Ile minut brakuje, żeby zdążyć: wyjście z zapasem wobec końca poprzedniej karty. */
export function legShortfall(
  leg: DayGap,
  plan: { minutes: number; departAt?: string },
  bufferMin: number,
): number | undefined {
  if (leg.leaveAt === undefined || leg.arriveBy === undefined) return undefined
  const latest = plan.departAt
    ? minutes(plan.departAt) - bufferMin
    : minutes(leg.arriveBy) - plan.minutes - bufferMin
  return minutes(leg.leaveAt) - latest
}

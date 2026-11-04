import type { CardSnapshot } from './cards'
import { hasCoords, type LatLng } from './maps'

// Przerwy między kartami dnia: czy się nakładają i czy jest sens sprawdzać dojazd.

export type DayGap = {
  from: string
  to: string
  /** Minuty między końcem jednej a startem drugiej karty; ujemne = nakładają się. */
  freeMin: number
  /** Koniec pierwszej karty (HH:MM) — wtedy trzeba wyjść. */
  leaveAt: string
  /** Skąd dokąd, gdy obie karty mają miejsce i dojazd ma sens. */
  route?: { from: LatLng; to: LatLng }
}

const minutes = (time: string) => {
  const [h = 0, m = 0] = time.split(':').map(Number)
  return h * 60 + m
}
const clock = (total: number) =>
  `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`

/**
 * Pary kolejnych kart dnia z godziną. Noclegi pomijamy (trwają kilka dni). Lot czy pociąg ma tylko
 * miejsce startu, więc po nim nie wiadomo, skąd liczyć dojazd — zostaje samo nakładanie się.
 * Brak czasu trwania = 0 minut, czyli ostrzeżenie tylko przy naprawdę niemożliwym układzie.
 */
export function dayGaps(cards: CardSnapshot[]): DayGap[] {
  const timed = cards
    .filter((c) => c.time && c.type !== 'stay' && !c.deletedAt)
    .sort((a, b) => (a.time as string).localeCompare(b.time as string))
  return timed.slice(1).map((to, i) => {
    const from = timed[i] as CardSnapshot
    const end = minutes(from.time as string) + (from.durationMin ?? 0)
    const gap: DayGap = {
      from: from.id,
      to: to.id,
      freeMin: minutes(to.time as string) - end,
      leaveAt: clock(end),
    }
    if (from.type !== 'transport' && hasCoords(from) && hasCoords(to))
      gap.route = {
        from: { lat: from.location.lat, lng: from.location.lng },
        to: { lat: to.location.lat, lng: to.location.lng },
      }
    return gap
  })
}

/** Zapas na wyjście i przesiadki doliczany do czasu dojazdu. */
export const TRAVEL_BUFFER_MIN = 10

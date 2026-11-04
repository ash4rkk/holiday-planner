// Wynik zaplanowanego odcinka — typy wspólne dla serwera i przeglądarki.

export type TravelMode = 'transit' | 'walk' | 'drive'

export const TRAVEL_MODE_LABELS: Record<TravelMode, string> = {
  transit: 'komunikacją',
  walk: 'pieszo',
  drive: 'autem',
}

export type LegStep = {
  kind: 'walk' | 'transit'
  minutes: number
  /** Linia, np. „15E”. */
  line?: string
  vehicle?: string
  from?: string
  to?: string
  stops?: number
  /** Odjazd z rozkładu (HH:MM, czas miejsca). */
  departs?: string
  headsign?: string
  /** Przebieg kroku (encoded polyline); po scaleniu pieszych odcinków może ich być kilka. */
  lines?: string[]
}

export type LegPlan = {
  minutes: number
  mode: TravelMode
  km?: number
  /** Kiedy ruszyć bez zapasu (HH:MM): z rozkładu albo z czasu dojazdu. */
  departAt?: string
  steps: LegStep[]
  /** Przebieg trasy w formacie encoded polyline. */
  polyline?: string
  /** Powrót: o tej porze nie ma już sensownego połączenia, zostaje dojście pieszo. */
  noService?: boolean
  checkedAt: string
}

/** Dłuższe czekanie na odjazd znaczy, że ostatnie połączenie już odjechało. */
export const NO_SERVICE_WAIT_MIN = 60

const clockMinutes = (time: string) => {
  const [h = 0, m = 0] = time.split(':').map(Number)
  return h * 60 + m
}

/** Minuty od `from` do `to` (HH:MM); odjazd po północy liczy się na następny dzień. */
export function waitMinutes(from: string, to: string): number {
  return (clockMinutes(to) - clockMinutes(from) + 1440) % 1440
}

/** Scala kolejne odcinki piesze: Google zwraca osobno każdy skręt. */
export function mergeWalks(steps: LegStep[]): LegStep[] {
  const out: LegStep[] = []
  for (const step of steps) {
    const last = out.at(-1)
    if (step.kind === 'walk' && last?.kind === 'walk') {
      last.minutes += step.minutes
      if (step.lines) last.lines = [...(last.lines ?? []), ...step.lines]
    } else out.push({ ...step })
  }
  return out.filter((s) => s.kind === 'transit' || s.minutes > 0)
}

const HOUR = 60 * 60_000

/** Rozkład się zmienia: im bliżej wyjścia, tym świeższy wynik jest potrzebny. */
export function planMaxAgeMs(msToDeparture: number): number {
  if (msToDeparture <= 3 * HOUR) return 45 * 60_000
  if (msToDeparture <= 24 * HOUR) return 6 * HOUR
  return 7 * 24 * HOUR
}

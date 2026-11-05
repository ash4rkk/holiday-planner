import { decodePolyline } from './maps'

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

/** Dłuższa trasa piesza to nie dojazd, tylko brak połączenia. */
export const MAX_FALLBACK_WALK_MIN = 45

/** Awaryjna trasa piesza za długa, żeby ją pokazać; piechurów i komunikat „nic nie jedzie” zostawia. */
export function isFarWalk(plan: LegPlan, travelMode: TravelMode): boolean {
  return (
    travelMode !== 'walk' &&
    plan.mode === 'walk' &&
    !plan.noService &&
    plan.minutes > MAX_FALLBACK_WALK_MIN
  )
}

/** Plany z pamięci telefonu bez takich tras: wiersz pokaże brak połączenia. */
export function withoutFarWalks(
  plans: Record<string, LegPlan | null>,
  travelMode: TravelMode,
): Record<string, LegPlan | null> {
  return Object.fromEntries(
    Object.entries(plans).map(([id, p]) => [id, p && isFarWalk(p, travelMode) ? null : p]),
  )
}

export type VehicleKind = 'tram' | 'metro' | 'bus' | 'rail' | 'ferry' | 'transit'

const VEHICLE_KINDS: Record<string, VehicleKind> = {
  tramwaj: 'tram',
  kolejka: 'tram',
  metro: 'metro',
  autobus: 'bus',
  trolejbus: 'bus',
  pociąg: 'rail',
  prom: 'ferry',
}

/** Rodzaj linii na mapie; plany zapisują pojazd słownie, więc działa też dla starych wyników. */
export function vehicleKind(step: Pick<LegStep, 'vehicle'>): VehicleKind {
  return VEHICLE_KINDS[step.vehicle ?? ''] ?? 'transit'
}

export type RouteMark =
  | { type: 'stop'; lng: number; lat: number; title: string; detail: string }
  | { type: 'line'; lng: number; lat: number; text: string; kind: VehicleKind }

/** Przystanki wejścia i wyjścia oraz nazwy linii: z końców i środka przebiegu każdego przejazdu. */
export function routeMarks(plan: Pick<LegPlan, 'steps'>): RouteMark[] {
  return plan.steps.flatMap((step): RouteMark[] => {
    const points = (step.lines ?? []).flatMap((line) => decodePolyline(line))
    const first = points[0]
    const last = points.at(-1)
    const middle = points[Math.floor(points.length / 2)]
    if (step.kind !== 'transit' || !first || !last || !middle) return []
    const ride = [step.vehicle, step.line].filter(Boolean).join(' ')
    const way = [
      step.headsign && `kierunek ${step.headsign}`,
      step.stops !== undefined && `${step.stops} przyst.`,
    ]
      .filter(Boolean)
      .join(' · ')
    return [
      {
        type: 'stop',
        lng: first[0],
        lat: first[1],
        title: `wsiadasz: ${step.from ?? 'przystanek'}`,
        detail: [`${ride}${step.departs ? ` o ${step.departs}` : ''}`, way]
          .filter(Boolean)
          .join('\n'),
      },
      {
        type: 'stop',
        lng: last[0],
        lat: last[1],
        title: `wysiadasz: ${step.to ?? 'przystanek'}`,
        detail: ride,
      },
      ...(step.line
        ? [
            {
              type: 'line' as const,
              lng: middle[0],
              lat: middle[1],
              text: step.line,
              kind: vehicleKind(step),
            },
          ]
        : []),
    ]
  })
}

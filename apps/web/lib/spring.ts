/**
 * Sprężyny ruchu (czysta matematyka, bez DOM): parametry jak w SwiftUI — `duration` to czas
 * odczuwalny w sekundach, `bounce` od 0 (bez odbicia). Wartości w px, prędkości w px/s.
 */
export type Spring = { duration: number; bounce: number }

/** Arkusze i zmiany układu. */
export const SMOOTH: Spring = { duration: 0.5, bounce: 0 }
/** Małe elementy, przełączniki, upuszczenie. */
export const SNAPPY: Spring = { duration: 0.35, bounce: 0.1 }
/** Wyjścia: krótko i bez odbicia. */
export const EXIT: Spring = { duration: 0.35, bounce: 0 }
/** Powrót po puszczeniu palca: odbicie tylko wtedy, gdy jest energia do rozproszenia. */
export const release = (velocity: number): Spring =>
  Math.abs(velocity) > 400 ? { duration: 0.45, bounce: 0.12 } : SMOOTH

/** Położenie i prędkość sprężyny po `t` sekundach. */
export function springAt(
  { duration, bounce }: Spring,
  from: number,
  to: number,
  velocity: number,
  t: number,
): { value: number; velocity: number } {
  const w = (2 * Math.PI) / duration
  const z = 1 - bounce
  const d = from - to
  if (z >= 1) {
    const c = velocity + w * d
    const e = Math.exp(-w * t)
    return { value: to + (d + c * t) * e, velocity: (c - w * (d + c * t)) * e }
  }
  const wd = w * Math.sqrt(1 - z * z)
  const a = z * w
  const b = (velocity + a * d) / wd
  const e = Math.exp(-a * t)
  const cos = Math.cos(wd * t)
  const sin = Math.sin(wd * t)
  return {
    value: to + e * (d * cos + b * sin),
    velocity: e * ((b * wd - a * d) * cos - (d * wd + a * b) * sin),
  }
}

export const FRAME = 1 / 60
const MAX_FRAMES = 150

/** Klatki od `from` do ustania ruchu; z `until` koniec na pierwszej klatce za tą wartością. */
export function springFrames(
  spring: Spring,
  from: number,
  to: number,
  velocity = 0,
  until?: number,
): number[] {
  const out = [from]
  const past = (v: number) => until !== undefined && (to > from ? v >= until : v <= until)
  for (let i = 1; i <= MAX_FRAMES; i++) {
    const s = springAt(spring, from, to, velocity, i * FRAME)
    if (past(s.value)) {
      out.push(until as number)
      return out
    }
    if (Math.abs(s.value - to) < 0.5 && Math.abs(s.velocity) < 20) break
    out.push(s.value)
  }
  out.push(to)
  return out
}

/** Gdzie zatrzymałoby się machnięcie (UIScrollView); 0.998 zwykłe, 0.99 szybkie hamowanie. */
export function project(velocity: number, rate = 0.998): number {
  return ((velocity / 1000) * rate) / (1 - rate)
}

/** Opór za krawędzią: im dalej, tym ciężej; nigdy więcej niż `dimension`. */
export function rubber(overshoot: number, dimension: number, c = 0.55): number {
  if (dimension <= 0) return 0
  const sign = Math.sign(overshoot)
  return sign * (1 - 1 / ((Math.abs(overshoot) * c) / dimension + 1)) * dimension
}

export function nearest(points: number[], value: number): number {
  let best = 0
  points.forEach((p, i) => {
    if (Math.abs(p - value) < Math.abs((points[best] as number) - value)) best = i
  })
  return best
}

/**
 * Punkt, w którym stanie arkusz po puszczeniu: najbliższy miejscu rzutu prędkości, ale najwyżej o
 * jeden dalej od tego, przy którym palec puścił (machnięcie z pełnego ekranu nie zamyka karty).
 */
export function snapIndex(points: number[], position: number, velocity: number): number {
  const here = nearest(points, position)
  const aimed = nearest(points, position + project(velocity))
  return Math.max(here - 1, Math.min(here + 1, aimed))
}

const WINDOW_MS = 100

/** Prędkość palca z ostatnich 100 ms ruchu (nie z całego gestu). */
export class VelocityTracker {
  private samples: { t: number; v: number }[] = []

  reset(t: number, v: number) {
    this.samples = [{ t, v }]
  }

  add(t: number, v: number) {
    this.samples.push({ t, v })
    while (this.samples.length > 2 && t - (this.samples[0]?.t ?? t) > WINDOW_MS)
      this.samples.shift()
  }

  /** px/s w chwili puszczenia; palec, który stanął, nie ma prędkości. */
  at(t: number): number {
    const last = this.samples.at(-1)
    const first = this.samples.find((s) => last && last.t - s.t <= WINDOW_MS)
    if (!first || !last || t - last.t > WINDOW_MS / 2) return 0
    const dt = last.t - first.t
    return dt > 0 ? ((last.v - first.v) / dt) * 1000 : 0
  }
}

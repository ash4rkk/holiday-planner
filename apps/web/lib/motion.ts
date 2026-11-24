import { FRAME, SMOOTH, type Spring, springAt, springFrames } from './spring'

/** „Ogranicz ruch” w systemie: zamiast sprężyn krótkie przenikanie. */
export function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Przewijanie z kodu: płynne, chyba że system prosi o mniej ruchu. */
export function scrollBehavior(): ScrollBehavior {
  return reducedMotion() ? 'auto' : 'smooth'
}

/** Czas przejścia w bibliotekach (React Flow): zero, gdy system prosi o mniej ruchu. */
export function motionMs(ms: number): number {
  return reducedMotion() ? 0 : ms
}

const FADE_MS = 150

/** Przenikanie zamiast ruchu („ogranicz ruch”). */
export function crossfade(el: Element | null | undefined, show: boolean) {
  el?.animate(
    { opacity: show ? [0, 1] : [1, 0] },
    { duration: FADE_MS, fill: show ? 'none' : 'forwards' },
  )
  return FADE_MS
}

/** Sprężyna jako czas i krzywa dla animacji, której klatki podaje przeglądarka (0 → 1). */
export function springTiming(spring: Spring): { duration: number; easing: string } {
  const values = springFrames(spring, 0, 1000).map((v) => +(v / 1000).toFixed(4))
  return { duration: (values.length - 1) * FRAME * 1000, easing: `linear(${values.join(', ')})` }
}

type Style = Record<string, string>
type Frame = (value: number) => [HTMLElement | null | undefined, Style][]

/**
 * Jedna wartość (np. przesunięcie arkusza) pod palcem i na sprężynie. Sprężyna idzie przez WAAPI z
 * klatek policzonych z góry, więc zajęty wątek jej nie przycina; `stop()` oddaje bieżące miejsce i
 * prędkość, żeby dało się złapać element w locie. Przy „ogranicz ruch” wartość wchodzi od razu.
 */
export class SpringMotion {
  value = 0
  private run: {
    spring: Spring
    from: number
    to: number
    velocity: number
    start: number
    anims: Animation[]
    timer: ReturnType<typeof setTimeout>
  } | null = null

  constructor(private readonly frame: Frame) {}

  get running() {
    return this.run !== null
  }

  private apply(value: number) {
    this.value = value
    for (const [el, style] of this.frame(value)) if (el) Object.assign(el.style, style)
  }

  set(value: number) {
    this.stop()
    this.apply(value)
  }

  /** Zatrzymuje w bieżącym miejscu. */
  stop(): { value: number; velocity: number } {
    const r = this.run
    if (!r) return { value: this.value, velocity: 0 }
    this.run = null
    clearTimeout(r.timer)
    const at = r.anims[0]?.currentTime
    const ms = typeof at === 'number' ? at : performance.now() - r.start
    const now = springAt(r.spring, r.from, r.to, r.velocity, ms / 1000)
    for (const a of r.anims) a.cancel()
    this.apply(now.value)
    return now
  }

  to(
    target: number,
    {
      spring = SMOOTH,
      velocity,
      until,
      onDone,
    }: {
      spring?: Spring
      /** Prędkość palca; bez niej zostaje ta, z którą element właśnie jedzie. */
      velocity?: number
      /** Koniec już w tym miejscu (arkusz poza ekranem). */
      until?: number
      onDone?: () => void
    } = {},
  ) {
    const now = this.stop()
    const v = velocity ?? now.velocity
    const end = until ?? target
    if (reducedMotion() || (now.value === target && Math.abs(v) < 1)) {
      this.apply(end)
      onDone?.()
      return
    }
    const values = springFrames(spring, now.value, target, v, until)
    const duration = (values.length - 1) * FRAME * 1000
    const tracks = new Map<HTMLElement, Style[]>()
    for (const value of values)
      for (const [el, style] of this.frame(value)) {
        if (!el) continue
        const list = tracks.get(el)
        if (list) list.push(style)
        else tracks.set(el, [style])
      }
    const anims = [...tracks].map(([el, frames]) => el.animate(frames, { duration }))
    this.apply(end)
    this.run = {
      spring,
      from: now.value,
      to: target,
      velocity: v,
      start: performance.now(),
      anims,
      timer: setTimeout(() => {
        this.run = null
        for (const a of anims) a.cancel()
        onDone?.()
      }, duration),
    }
  }
}

/** Element stoi już w nowym miejscu: dojeżdża do niego sprężyną z przesunięcia `dx`, `dy`. */
export function springFrom(
  el: HTMLElement,
  d: { dx: number; dy: number; vx?: number; vy?: number },
  spring: Spring = SMOOTH,
): Animation | undefined {
  if (reducedMotion()) return
  const xs = springFrames(spring, d.dx, 0, d.vx)
  const ys = springFrames(spring, d.dy, 0, d.vy)
  const n = Math.max(xs.length, ys.length)
  const frames = Array.from({ length: n }, (_, i) => ({
    transform: `translate(${xs[i] ?? 0}px, ${ys[i] ?? 0}px)`,
  }))
  return el.animate(frames, { duration: (n - 1) * FRAME * 1000 })
}

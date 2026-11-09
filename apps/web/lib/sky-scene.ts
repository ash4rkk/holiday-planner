// Scena pogody w tle karty (canvas 2D, bez bibliotek): chmury z paralaksą, deszcz w trzech
// warstwach głębi z porywami wiatru, rozbryzgi i kręgi na „kałuży” przy dolnej krawędzi, krople
// spływające po „szybie” karty, a w burzy rozgałęzione błyskawice z poświatą, błyskiem i drżeniem.
// Czysta logika rysowania — pętlę, rozmiar i widoczność prowadzi `components/sky/card-sky.tsx`.

export type SkyKind = 'rain' | 'storm'
type RGB = [number, number, number]

export type SkyPalette = {
  /** Kolor kropel (z `--blue`, rozjaśniony w ciemnym trybie). */
  drop: RGB
  /** Chmura jasna (tylna) i ciemna (przednia). */
  cloudBack: RGB
  cloudFront: RGB
  /** Kolor błyskawicy i błysku. */
  flash: RGB
  dark: boolean
}

type Drop = { x: number; y: number; z: number }
type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number }
type Ripple = { x: number; life: number; max: number; w: number }
type Bead = { x: number; y: number; r: number; vy: number; sliding: boolean; trail: number }
type Puff = { dx: number; dy: number; r: number }
type Cloud = { x: number; y: number; s: number; speed: number; front: boolean; puffs: Puff[] }
type Segment = [number, number, number, number, number]
type Bolt = { segments: Segment[]; life: number; max: number }

const TAU = Math.PI * 2
const rand = (a: number, b: number) => a + Math.random() * (b - a)
const rgba = ([r, g, b]: RGB, a: number) => `rgba(${r | 0},${g | 0},${b | 0},${a})`
export const mixRgb = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
]
export function hexRgb(hex: string): RGB {
  const h = hex.trim().replace('#', '')
  const n = Number.parseInt(h.length === 3 ? [...h].map((c) => c + c).join('') : h, 16)
  return Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [120, 140, 170]
}

/** Błyskawica: łamana z przemieszczeniem punktu środkowego i odnogami, cieńszymi z głębokością. */
export function makeBolt(x0: number, y0: number, x1: number, y1: number): Segment[] {
  const out: Segment[] = []
  const split = (ax: number, ay: number, bx: number, by: number, width: number, depth: number) => {
    const len = Math.hypot(bx - ax, by - ay)
    if (depth <= 0 || len < 6) {
      out.push([ax, ay, bx, by, width])
      return
    }
    const mx = (ax + bx) / 2 + rand(-0.5, 0.5) * len * 0.45
    const my = (ay + by) / 2 + rand(-0.12, 0.12) * len
    split(ax, ay, mx, my, width, depth - 1)
    split(mx, my, bx, by, width * 0.92, depth - 1)
    // Odnoga: z punktu środkowego w bok i w dół, krótsza i cieńsza.
    if (depth >= 3 && Math.random() < 0.55) {
      const angle = Math.atan2(by - ay, bx - ax) + rand(0.35, 0.9) * (Math.random() < 0.5 ? -1 : 1)
      const bl = len * rand(0.3, 0.55)
      split(mx, my, mx + Math.cos(angle) * bl, my + Math.sin(angle) * bl, width * 0.55, depth - 2)
    }
  }
  split(x0, y0, x1, y1, 2.2, 6)
  return out
}

function makeCloud(w: number, front: boolean): Cloud {
  const s = front ? rand(0.85, 1.15) : rand(0.6, 0.85)
  const count = 5 + Math.floor(Math.random() * 3)
  const puffs: Puff[] = []
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1)
    puffs.push({
      dx: (t - 0.5) * 70,
      // Środek kłębu wyżej, brzegi niżej — kształt cumulusa.
      dy: -Math.sin(t * Math.PI) * 12 + rand(-3, 3),
      r: 13 + Math.sin(t * Math.PI) * 11 + rand(-2, 3),
    })
  }
  return {
    x: rand(-40, w + 40),
    y: front ? rand(-17, -9) : rand(-23, -15),
    s,
    speed: front ? rand(9, 15) : rand(4, 8),
    front,
    puffs,
  }
}

export class SkyScene {
  private w = 0
  private h = 0
  private t = 0
  private drops: Drop[] = []
  private particles: Particle[] = []
  private ripples: Ripple[] = []
  private beads: Bead[] = []
  private clouds: Cloud[] = []
  private bolts: Bolt[] = []
  private nextStrike = rand(1.2, 3.5)
  private flash = 0
  private shake = 0
  private shakeAt = -1

  constructor(
    private readonly kind: SkyKind,
    private palette: SkyPalette,
  ) {}

  setPalette(p: SkyPalette) {
    this.palette = p
  }

  resize(w: number, h: number) {
    if (w === this.w && h === this.h) return
    this.w = w
    this.h = h
    const storm = this.kind === 'storm'
    const count = Math.round((w * h) / (storm ? 380 : 620))
    this.drops = Array.from({ length: count }, () => this.newDrop(true))
    const clouds = Math.max(3, Math.round(w / (storm ? 55 : 75)))
    this.clouds = [
      ...Array.from({ length: clouds }, () => makeCloud(w, false)),
      ...Array.from({ length: clouds }, () => makeCloud(w, true)),
    ]
    this.beads = Array.from({ length: Math.round(w / 45) }, () => this.newBead())
  }

  private newDrop(anywhere: boolean): Drop {
    return {
      x: rand(-20, this.w + 20),
      y: anywhere ? rand(-this.h * 0.2, this.h) : rand(0, 12),
      z: Math.random() ** 0.7,
    }
  }

  private newBead(): Bead {
    return {
      x: rand(8, this.w - 8),
      y: rand(this.h * 0.3, this.h - 10),
      r: rand(1.1, 2.6),
      vy: 0,
      sliding: false,
      trail: 0,
    }
  }

  private wind() {
    const base = this.kind === 'storm' ? 0.32 : 0.16
    return base + Math.sin(this.t * 0.6) * 0.07 + Math.sin(this.t * 1.7 + 1) * 0.04
  }

  step(dt: number) {
    const { w, h, kind } = this
    if (!w || !h) return
    this.t += dt
    const storm = kind === 'storm'
    const slant = Math.tan(this.wind())

    for (const c of this.clouds) {
      c.x += c.speed * dt
      if (c.x - 60 * c.s > w) Object.assign(c, makeCloud(w, c.front), { x: -60 * c.s })
    }

    for (const d of this.drops) {
      const speed = (480 + 620 * d.z) * (storm ? 1.35 : 1)
      d.y += speed * dt
      d.x += speed * slant * dt
      if (d.x > w + 20) d.x -= w + 40
      if (d.y >= h - 1) {
        // Uderzenie w „kałużę”: bliższe krople robią rozbryzg i krąg.
        if (d.z > 0.6) {
          const n = d.z > 0.85 ? 2 : 1
          for (let i = 0; i < n; i++)
            this.particles.push({
              x: d.x,
              y: h - 1,
              vx: rand(-70, 70) + speed * slant * 0.15,
              vy: -rand(50, 150) * d.z,
              life: 0,
              max: rand(0.25, 0.45),
            })
          if (Math.random() < 0.28)
            this.ripples.push({ x: d.x, life: 0, max: rand(0.35, 0.6), w: rand(4, 8) * d.z })
        }
        Object.assign(d, this.newDrop(false))
      }
    }

    for (const p of this.particles) {
      p.life += dt
      p.vy += 900 * dt
      p.x += p.vx * dt
      p.y += p.vy * dt
    }
    this.particles = this.particles.filter((p) => p.life < p.max && p.y <= h)
    for (const r of this.ripples) r.life += dt
    this.ripples = this.ripples.filter((r) => r.life < r.max)

    // Krople na szybie: od czasu do czasu któraś rusza i spływa, zostawiając ślad.
    for (const b of this.beads) {
      if (!b.sliding && Math.random() < dt * 0.12) b.sliding = true
      if (b.sliding) {
        b.vy = Math.min(b.vy + 140 * dt, 70)
        b.y += b.vy * dt
        b.x += Math.sin(this.t * 6 + b.r * 10) * 6 * dt
        b.trail = Math.min(b.trail + b.vy * dt, 40)
        if (b.y > h + b.r) Object.assign(b, this.newBead(), { y: rand(4, h * 0.5) })
      }
    }

    if (storm) {
      this.nextStrike -= dt
      if (this.nextStrike <= 0) {
        const x0 = rand(w * 0.15, w * 0.85)
        this.bolts.push({
          segments: makeBolt(x0, rand(4, 14), x0 + rand(-w * 0.25, w * 0.25), h),
          life: 0,
          max: 0.42,
        })
        // Czasem druga, równoległa błyskawica tuż po pierwszej.
        if (Math.random() < 0.3) {
          const x1 = rand(w * 0.1, w * 0.9)
          this.bolts.push({
            segments: makeBolt(x1, rand(4, 14), x1 + rand(-w * 0.2, w * 0.2), h * rand(0.6, 1)),
            life: -0.12,
            max: 0.32,
          })
        }
        this.shakeAt = this.t + rand(0.25, 0.6)
        this.nextStrike = rand(2.8, 7.5)
      }
      for (const b of this.bolts) b.life += dt
      this.bolts = this.bolts.filter((b) => b.life < b.max)
      // Błysk: suma migotania aktywnych błyskawic (szybkie mrugnięcia w pierwszej części życia).
      this.flash = Math.max(0, this.flash - dt * 3.2)
      for (const b of this.bolts)
        if (b.life >= 0) this.flash = Math.max(this.flash, flicker(b.life / b.max))
      if (this.shakeAt > 0 && this.t >= this.shakeAt) {
        this.shake = 1
        this.shakeAt = -1
      }
      this.shake = Math.max(0, this.shake - dt * 2.2)
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    const { w, h, palette: p, kind } = this
    if (!w || !h) return
    const storm = kind === 'storm'
    ctx.clearRect(0, 0, w, h)
    ctx.save()
    if (this.shake > 0)
      ctx.translate(
        Math.sin(this.t * 90) * 1.4 * this.shake,
        Math.cos(this.t * 73) * 0.9 * this.shake,
      )

    // Cień chmur od góry: niebo ciemnieje ku górze karty.
    const sky = ctx.createLinearGradient(0, 0, 0, h)
    sky.addColorStop(0, rgba(p.cloudFront, storm ? 0.22 : 0.12))
    sky.addColorStop(0.4, rgba(p.cloudFront, 0))
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, w, h)

    // Deszcz: od dalekich (krótkie, blade) do bliskich (długie, wyraźne).
    const slant = Math.tan(this.wind())
    ctx.lineCap = 'round'
    for (const layer of [0, 1, 2]) {
      ctx.beginPath()
      const lo = layer / 3
      const hi = (layer + 1) / 3
      let any = false
      for (const d of this.drops) {
        if (d.z < lo || d.z >= hi) continue
        const len = (7 + 16 * d.z) * (storm ? 1.25 : 1)
        ctx.moveTo(d.x, d.y)
        ctx.lineTo(d.x - slant * len, d.y - len)
        any = true
      }
      if (!any) continue
      ctx.strokeStyle = rgba(p.drop, 0.08 + hi * (p.dark ? 0.3 : 0.28))
      ctx.lineWidth = 0.5 + hi * 0.9
      ctx.stroke()
    }

    // Kałuża przy dolnej krawędzi: pasek połysku, kręgi i rozbryzgi.
    const puddle = ctx.createLinearGradient(0, h - 9, 0, h)
    puddle.addColorStop(0, rgba(p.drop, 0))
    puddle.addColorStop(1, rgba(p.drop, p.dark ? 0.14 : 0.1))
    ctx.fillStyle = puddle
    ctx.fillRect(0, h - 9, w, 9)
    ctx.lineWidth = 0.9
    for (const r of this.ripples) {
      const k = r.life / r.max
      ctx.strokeStyle = rgba(p.drop, 0.4 * (1 - k))
      ctx.beginPath()
      ctx.ellipse(r.x, h - 2.5, r.w * (0.3 + k), r.w * 0.22 * (0.3 + k), 0, 0, TAU)
      ctx.stroke()
    }
    ctx.fillStyle = rgba(p.drop, 0.6)
    for (const s of this.particles) {
      ctx.globalAlpha = 1 - s.life / s.max
      ctx.fillRect(s.x, s.y, 1.3, 1.3)
    }
    ctx.globalAlpha = 1

    // Krople na szybie: ślad, ciemny brzeg i odblask (wyglądają jak soczewki).
    for (const b of this.beads) {
      if (b.trail > 1) {
        const g = ctx.createLinearGradient(0, b.y - b.trail, 0, b.y)
        g.addColorStop(0, rgba(p.drop, 0))
        g.addColorStop(1, rgba(p.drop, 0.28))
        ctx.strokeStyle = g
        ctx.lineWidth = b.r * 0.9
        ctx.beginPath()
        ctx.moveTo(b.x, b.y - b.trail)
        ctx.lineTo(b.x, b.y)
        ctx.stroke()
      }
      ctx.fillStyle = rgba(p.drop, p.dark ? 0.32 : 0.22)
      ctx.beginPath()
      ctx.arc(b.x, b.y, b.r, 0, TAU)
      ctx.fill()
      ctx.fillStyle = `rgba(255,255,255,${p.dark ? 0.55 : 0.85})`
      ctx.beginPath()
      ctx.arc(b.x - b.r * 0.35, b.y - b.r * 0.35, b.r * 0.35, 0, TAU)
      ctx.fill()
    }

    // Błyskawice: poświata, środek i biały rdzeń.
    for (const b of this.bolts) {
      if (b.life < 0) continue
      const a = flicker(b.life / b.max)
      if (a <= 0.02) continue
      for (const [width, alpha, color] of [
        [7, 0.18, p.flash],
        [3, 0.55, p.flash],
        [1.2, 1, p.dark ? ([255, 255, 255] as RGB) : mixRgb(p.flash, [255, 255, 255], 0.45)],
      ] as const) {
        ctx.strokeStyle = rgba(color, alpha * a)
        ctx.shadowColor = rgba(p.flash, 0.9 * a)
        ctx.shadowBlur = width > 2 ? 14 : 4
        ctx.beginPath()
        for (const [x0, y0, x1, y1, sw] of b.segments) {
          ctx.lineWidth = width * sw * 0.5
          ctx.moveTo(x0, y0)
          ctx.lineTo(x1, y1)
        }
        ctx.stroke()
      }
      ctx.shadowBlur = 0
    }

    // Chmury na wierzchu deszczu (krople z nich wypadają); w błysku podświetlone od środka.
    const lit = this.flash
    for (const front of [false, true]) {
      const base = front ? p.cloudFront : p.cloudBack
      const color = lit > 0 ? mixRgb(base, p.flash, lit * (front ? 0.55 : 0.75)) : base
      for (const c of this.clouds) {
        if (c.front !== front) continue
        ctx.fillStyle = rgba(color, front ? (storm ? 0.92 : 0.82) : 0.6)
        ctx.beginPath()
        for (const puff of c.puffs) {
          ctx.moveTo(c.x + puff.dx * c.s + puff.r * c.s, c.y + puff.dy * c.s)
          ctx.arc(c.x + puff.dx * c.s, c.y + puff.dy * c.s, puff.r * c.s, 0, TAU)
        }
        ctx.fill()
        // Jaśniejszy wierzch kłębów — objętość zamiast płaskiej plamy.
        ctx.fillStyle = rgba(mixRgb(color, [255, 255, 255], p.dark ? 0.12 : 0.35), 0.35)
        ctx.beginPath()
        for (const puff of c.puffs) {
          ctx.moveTo(
            c.x + puff.dx * c.s + puff.r * c.s * 0.6,
            c.y + puff.dy * c.s - puff.r * c.s * 0.35,
          )
          ctx.arc(
            c.x + puff.dx * c.s,
            c.y + puff.dy * c.s - puff.r * c.s * 0.35,
            puff.r * c.s * 0.6,
            0,
            TAU,
          )
        }
        ctx.fill()
      }
    }

    // Błysk całej karty.
    if (lit > 0) {
      ctx.fillStyle = rgba(p.flash, lit * (p.dark ? 0.14 : 0.22))
      ctx.fillRect(-4, -4, w + 8, h + 8)
    }
    ctx.restore()
  }
}

/** Migotanie błyskawicy w czasie życia 0…1: dwa–trzy szybkie mrugnięcia i wygaszanie. */
export function flicker(k: number): number {
  if (k < 0 || k >= 1) return 0
  if (k < 0.12) return 1
  if (k < 0.2) return 0.15
  if (k < 0.32) return 0.9
  if (k < 0.4) return 0.25
  return 0.75 * (1 - (k - 0.4) / 0.6)
}

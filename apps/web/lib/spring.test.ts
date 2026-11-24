import { describe, expect, it } from 'vitest'
import {
  project,
  rubber,
  SMOOTH,
  SNAPPY,
  snapIndex,
  springAt,
  springFrames,
  VelocityTracker,
} from './spring'

describe('springAt', () => {
  it('rusza z podanego miejsca i z prędkością palca, kończy w celu', () => {
    for (const s of [SMOOTH, SNAPPY, { duration: 0.5, bounce: 0.3 }]) {
      const start = springAt(s, 120, 0, 900, 0)
      expect(start.value).toBeCloseTo(120)
      expect(start.velocity).toBeCloseTo(900)
      expect(springAt(s, 120, 0, 900, 3).value).toBeCloseTo(0)
    }
  })

  it('prędkość jest pochodną położenia', () => {
    for (const s of [SMOOTH, SNAPPY]) {
      const h = 1e-5
      const a = springAt(s, 300, 20, -500, 0.1 - h).value
      const b = springAt(s, 300, 20, -500, 0.1 + h).value
      expect(springAt(s, 300, 20, -500, 0.1).velocity).toBeCloseTo((b - a) / (2 * h), 2)
    }
  })

  it('bez odbicia nie przelatuje celu', () => {
    for (const v of springFrames(SMOOTH, 400, 0)) expect(v).toBeGreaterThanOrEqual(0)
    expect(Math.min(...springFrames({ duration: 0.5, bounce: 0.3 }, 400, 0))).toBeLessThan(0)
  })
})

describe('springFrames', () => {
  it('kończy dokładnie w celu', () => {
    const f = springFrames(SMOOTH, 480, 0)
    expect(f[0]).toBe(480)
    expect(f.at(-1)).toBe(0)
  })

  it('urywa się za granicą (arkusz zszedł z ekranu)', () => {
    const f = springFrames({ duration: 0.35, bounce: 0 }, 100, 528, 0, 480)
    expect(f.at(-1)).toBe(480)
    expect(Math.max(...f)).toBe(480)
    expect(f.length / 60).toBeLessThan(0.3)
  })

  it('bez ruchu i prędkości to jedna klatka na miejscu', () => {
    expect(springFrames(SMOOTH, 0, 0)).toEqual([0, 0])
  })
})

describe('rubber', () => {
  it('stawia rosnący opór i zachowuje kierunek', () => {
    expect(rubber(0, 800)).toBe(0)
    expect(rubber(100, 800)).toBeLessThan(100)
    expect(rubber(-100, 800)).toBeCloseTo(-rubber(100, 800))
    expect(rubber(1e6, 800)).toBeLessThan(800)
  })
})

describe('snapIndex', () => {
  const points = [0, 320, 800]
  it('szybkie machnięcie po małym ruchu zmienia punkt', () => {
    expect(project(1000)).toBeCloseTo(499)
    expect(snapIndex(points, 340, 900)).toBe(2)
    expect(snapIndex(points, 300, -900)).toBe(0)
  })
  it('puszczenie bez prędkości wraca do najbliższego', () => {
    expect(snapIndex(points, 400, 0)).toBe(1)
    expect(snapIndex(points, 600, 0)).toBe(2)
  })
  it('z pełnego ekranu najwyżej o jeden punkt', () => {
    expect(snapIndex(points, 40, 4000)).toBe(1)
  })
  it('zawrócenie palca unieważnia pociągnięcie', () => {
    expect(snapIndex(points, 520, -600)).toBe(1)
  })
})

describe('VelocityTracker', () => {
  it('liczy z końcówki ruchu', () => {
    const v = new VelocityTracker()
    v.reset(0, 0)
    v.add(500, 5)
    for (let i = 1; i <= 6; i++) v.add(500 + i * 16, 5 + i * 16)
    expect(v.at(600)).toBeCloseTo(1000, -1)
  })
  it('palec, który stanął, nie ma prędkości', () => {
    const v = new VelocityTracker()
    v.reset(0, 0)
    v.add(16, 40)
    expect(v.at(16)).toBeGreaterThan(0)
    expect(v.at(300)).toBe(0)
  })
})

import { describe, expect, it } from 'vitest'
import { mergeWalks, planMaxAgeMs, waitMinutes } from './route-plan'

describe('mergeWalks', () => {
  it('łączy kolejne odcinki piesze i zostawia przejazdy', () => {
    expect(
      mergeWalks([
        { kind: 'walk', minutes: 1 },
        { kind: 'walk', minutes: 3 },
        { kind: 'transit', minutes: 20, line: '15E' },
        { kind: 'walk', minutes: 2 },
        { kind: 'walk', minutes: 0 },
      ]),
    ).toEqual([
      { kind: 'walk', minutes: 4 },
      { kind: 'transit', minutes: 20, line: '15E' },
      { kind: 'walk', minutes: 2 },
    ])
  })
})

describe('planMaxAgeMs', () => {
  it('im bliżej wyjścia, tym krócej ważny wynik', () => {
    const h = 3_600_000
    expect(planMaxAgeMs(h)).toBeLessThan(planMaxAgeMs(10 * h))
    expect(planMaxAgeMs(10 * h)).toBeLessThan(planMaxAgeMs(100 * h))
  })
})

describe('waitMinutes', () => {
  it('liczy czekanie, także przez północ', () => {
    expect(waitMinutes('21:10', '21:14')).toBe(4)
    expect(waitMinutes('23:30', '05:40')).toBe(370)
  })
})

describe('mergeWalks z przebiegiem', () => {
  it('scala też linie pieszych kroków', () => {
    const [walk] = mergeWalks([
      { kind: 'walk', minutes: 1, lines: ['a'] },
      { kind: 'walk', minutes: 2, lines: ['b'] },
    ])
    expect(walk?.lines).toEqual(['a', 'b'])
  })
})

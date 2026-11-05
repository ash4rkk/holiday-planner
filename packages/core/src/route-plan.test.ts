import { describe, expect, it } from 'vitest'
import {
  isFarWalk,
  type LegPlan,
  mergeWalks,
  planMaxAgeMs,
  routeMarks,
  vehicleKind,
  waitMinutes,
  withoutFarWalks,
} from './route-plan'

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

describe('isFarWalk', () => {
  const walk = (minutes: number, extra: Partial<LegPlan> = {}): LegPlan => ({
    minutes,
    mode: 'walk',
    steps: [],
    checkedAt: '',
    ...extra,
  })

  it('długa trasa piesza to brak połączenia, krótka zostaje', () => {
    expect(isFarWalk(walk(406), 'transit')).toBe(true)
    expect(isFarWalk(walk(45), 'transit')).toBe(false)
  })

  it('zostawia wybór chodzenia, przejazd i komunikat o braku kursów', () => {
    expect(isFarWalk(walk(406), 'walk')).toBe(false)
    expect(isFarWalk(walk(406, { mode: 'transit' }), 'transit')).toBe(false)
    expect(isFarWalk(walk(406, { noService: true }), 'transit')).toBe(false)
  })

  it('czyści plany zapisane w telefonie', () => {
    const near = walk(20)
    expect(withoutFarWalks({ a: walk(406), b: near, c: null }, 'transit')).toEqual({
      a: null,
      b: near,
      c: null,
    })
  })
})

describe('routeMarks', () => {
  // Trzy punkty: (38.5, -120.2), (40.7, -120.95), (43.252, -126.453).
  const line = '_p~iF~ps|U_ulLnnqC_mqNvxq`@'
  const ride = {
    kind: 'transit' as const,
    minutes: 12,
    line: '15E',
    vehicle: 'tramwaj',
    from: 'Belém',
    to: 'Praça da Figueira',
    departs: '09:32',
    headsign: 'Algés',
    stops: 9,
    lines: [line],
  }

  it('wejście, wyjście i nazwa linii z przebiegu', () => {
    const [enter, leave, name] = routeMarks({ steps: [ride] })
    expect(enter).toMatchObject({ type: 'stop', title: 'wsiadasz: Belém', lat: 38.5, lng: -120.2 })
    expect(enter).toMatchObject({ detail: 'tramwaj 15E o 09:32\nkierunek Algés · 9 przyst.' })
    expect(leave).toMatchObject({ title: 'wysiadasz: Praça da Figueira', lat: 43.252 })
    expect(name).toMatchObject({ type: 'line', text: '15E', kind: 'tram', lat: 40.7 })
  })

  it('pomija kroki piesze i przejazdy bez przebiegu', () => {
    const walk = { kind: 'walk' as const, minutes: 5, lines: [line] }
    expect(routeMarks({ steps: [walk, { ...ride, lines: undefined }] })).toEqual([])
  })

  it('rodzaj pojazdu ze słownej nazwy', () => {
    expect(vehicleKind({ vehicle: 'metro' })).toBe('metro')
    expect(vehicleKind({ vehicle: 'trolejbus' })).toBe('bus')
    expect(vehicleKind({ vehicle: 'przejazd' })).toBe('transit')
  })
})

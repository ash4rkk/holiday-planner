import { describe, expect, it } from 'vitest'
import {
  asEstimate,
  choosePlan,
  isFarWalk,
  isStaleSchedule,
  type LegDraft,
  type LegPlan,
  mergeWalks,
  needsTransit,
  type PlanInput,
  planMaxAgeMs,
  routeMarks,
  scheduleGap,
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

describe('choosePlan', () => {
  const walk = (minutes: number): LegDraft => ({ minutes, mode: 'walk', steps: [] })
  const ride = (departs: string, minutes = 20): LegDraft => ({
    minutes,
    mode: 'transit',
    departAt: departs,
    steps: [{ kind: 'transit', minutes, departs }],
  })
  const base: PlanInput = { mode: 'transit', osrm: walk(30), arriveBy: '14:00', daysAhead: 1 }
  const night: PlanInput = { ...base, arriveBy: undefined, leaveAt: '23:30' }

  it('krótki odcinek pieszo, bez pytania Google', () => {
    const input = { ...base, osrm: walk(8) }
    expect(needsTransit(input)).toBe(false)
    expect(choosePlan(input)).toEqual({ plan: walk(8), keep: true })
  })

  it('pieszo szybciej niż komunikacją → pieszo', () => {
    expect(choosePlan(base, { kind: 'ok', plan: ride('13:20', 40) }).plan).toEqual(walk(30))
    expect(choosePlan(base, { kind: 'ok', plan: ride('13:20', 15) }).plan?.mode).toBe('transit')
  })

  it('błąd Google to nie „nic nie jedzie”: dojście pieszo bez zapisu', () => {
    const choice = choosePlan(night, { kind: 'error' })
    expect(choice).toEqual({ plan: walk(30), keep: false })
    expect(choosePlan({ ...night, osrm: walk(90) }, { kind: 'error' }).plan).toBeNull()
  })

  it('pusta odpowiedź nocą: nic nie jedzie, z zapisem', () => {
    expect(choosePlan(night, { kind: 'empty' })).toEqual({
      plan: { ...walk(30), noService: true },
      keep: true,
    })
  })

  it('poranny kurs przy nocnym powrocie: nic nie jedzie', () => {
    const choice = choosePlan(night, { kind: 'ok', plan: ride('05:40') })
    expect(choice.plan?.noService).toBe(true)
  })

  it('nic nie jedzie, a pieszo wiele godzin: brak połączenia zamiast trasy pieszej', () => {
    expect(choosePlan({ ...night, osrm: walk(45_088) }, { kind: 'empty' }).plan).toBeNull()
  })

  it('daleka data: rozkładu jeszcze nie ma', () => {
    expect(choosePlan({ ...night, daysAhead: 20 }, { kind: 'empty' })).toEqual({
      plan: null,
      keep: false,
      early: true,
    })
    const far = { ...base, daysAhead: 90 }
    expect(needsTransit(far)).toBe(false)
    expect(choosePlan(far).early).toBe(true)
  })

  it('limit: krótkie dojście pieszo i znacznik', () => {
    expect(choosePlan(base, { kind: 'limited' })).toEqual({
      plan: walk(30),
      keep: false,
      limited: true,
    })
  })

  it('inne połączenie: tylko przejazd, nigdy pieszo', () => {
    const r = ride('13:00', 40)
    expect(choosePlan({ ...base, ride: true }, { kind: 'ok', plan: r }).plan).toEqual(r)
    expect(choosePlan({ ...base, ride: true }, { kind: 'error' }).plan).toBeNull()
  })

  it('auto i pieszo z OSRM bez Google', () => {
    const car: LegDraft = { minutes: 12, mode: 'drive', steps: [] }
    expect(needsTransit({ ...base, mode: 'drive', osrm: car })).toBe(false)
    expect(choosePlan({ ...base, mode: 'drive', osrm: car })).toEqual({ plan: car, keep: true })
  })
})

describe('rozkład, którego Google jeszcze nie ma', () => {
  // Fig Tree House → Nyugati na 2.01 rano: Google podał nocne metro (rozkład kończy się 1.01).
  const night: LegDraft = {
    minutes: 38,
    mode: 'transit',
    departAt: '00:31',
    steps: [
      { kind: 'walk', minutes: 11 },
      { kind: 'transit', minutes: 8, line: 'M2', departs: '00:42' },
      { kind: 'transit', minutes: 3, line: 'M3', departs: '01:03' },
    ],
  }
  const morning: LegDraft = {
    ...night,
    departAt: '07:16',
    steps: [
      { kind: 'walk', minutes: 6 },
      { kind: 'transit', minutes: 11, line: '1', departs: '07:27' },
      { kind: 'transit', minutes: 5, line: 'M3', departs: '07:46' },
    ],
  }
  const when = { arriveBy: '07:57' }

  it('scheduleGap: przyjazd za wcześnie, spóźnienie to 0', () => {
    expect(scheduleGap(night, when)).toBe(408)
    expect(scheduleGap(morning, when)).toBe(3)
    expect(scheduleGap({ ...morning, departAt: '07:30' }, when)).toBe(0)
    expect(scheduleGap(night, { leaveAt: '22:00' })).toBe(162)
  })

  it('brak rozkładu tylko daleko naprzód i gdy tydzień wcześniej jest normalnie', () => {
    expect(isStaleSchedule(night, morning, when, 50)).toBe(true)
    // Rzadki kurs: tydzień wcześniej też trzeba wyjść w nocy.
    expect(isStaleSchedule(night, night, when, 50)).toBe(false)
    // Bliska data: Google ma rozkład, wynik jest prawdziwy.
    expect(isStaleSchedule(night, morning, when, 5)).toBe(false)
    expect(isStaleSchedule(night, null, when, 50)).toBe(false)
  })

  it('choosePlan: orientacyjna trasa przesunięta do potrzebnej pory', () => {
    const choice = choosePlan(
      { mode: 'transit', osrm: null, arriveBy: '07:57', daysAhead: 50 },
      { kind: 'stale', plan: night },
    )
    expect(choice).toMatchObject({ keep: false, early: true })
    expect(choice.plan).toMatchObject({ estimate: true, departAt: '07:19' })
    expect(choice.plan?.steps.map((s) => s.departs)).toEqual([undefined, '07:30', '07:51'])
    expect(asEstimate(night, { leaveAt: '22:00' }).steps[1]?.departs).toBe('22:00')
  })
})

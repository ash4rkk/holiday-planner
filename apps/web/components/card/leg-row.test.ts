import { describe, expect, it } from 'vitest'
import { fareText, shiftRequest, timeline } from './leg-row'

describe('oś dojazdu', () => {
  it('godziny kroków: wyjście, odjazd z rozkładu, wysiadka, na miejscu', () => {
    const rows = timeline(
      [
        { kind: 'walk', minutes: 5 },
        {
          kind: 'transit',
          minutes: 8,
          vehicle: 'tramwaj',
          line: '28E',
          from: 'R. Graça',
          to: 'Lg. Portas do Sol',
          stops: 5,
          departs: '20:12',
        },
        { kind: 'walk', minutes: 4 },
      ],
      '19:57',
    )
    expect(rows.map((r) => [r.time, r.kind, r.title])).toEqual([
      ['19:57', 'walk', 'wyjście'],
      ['20:12', 'transit', 'R. Graça'],
      ['20:20', 'walk', 'Lg. Portas do Sol'],
      ['20:24', 'end', 'na miejscu'],
    ])
    expect(rows[1]?.line).toBe('28E')
    expect(rows[1]?.detail).toBe('tramwaj · 5 przyst. · 8 min')
  })

  it('bez godziny startu i bez pieszego końca: wysiadka jako cel', () => {
    const rows = timeline([
      { kind: 'transit', minutes: 10, line: '15E', from: 'Cais do Sodré', to: 'Belém' },
    ])
    expect(rows.map((r) => [r.time, r.title])).toEqual([
      [undefined, 'Cais do Sodré'],
      [undefined, 'Belém'],
    ])
  })
})

describe('inne połączenie', () => {
  // Wyjście 19:57, 15 min dojścia, tramwaj 20:12, na miejscu 20:24.
  const plan = {
    departAt: '19:57',
    minutes: 27,
    steps: [
      { kind: 'walk' as const, minutes: 15 },
      { kind: 'transit' as const, minutes: 8, departs: '20:12' },
      { kind: 'walk' as const, minutes: 4 },
    ],
  }

  it('później: od wyjścia, nie od odjazdu (inaczej przeskakuje kursy)', () => {
    expect(shiftRequest(plan, 'later')).toEqual({ leaveAt: '19:58' })
  })

  it('wcześniej: przed przyjazdem na miejsce, nie przed końcem pierwszego przejazdu', () => {
    expect(shiftRequest(plan, 'earlier')).toEqual({ arriveBy: '20:23' })
  })

  it('bez godzin nie ma czego przesuwać', () => {
    expect(shiftRequest({ minutes: 10, steps: [] }, 'later')).toBeUndefined()
  })
})

describe('cena biletu', () => {
  it('kwota z walutą na osobę', () => {
    expect(fareText({ amount: 3.1, currency: 'EUR' })).toMatch(/^bilet ok\. 3,10\s?€ \/ os\.$/)
  })
})

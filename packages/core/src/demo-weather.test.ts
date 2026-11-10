import { describe, expect, it } from 'vitest'
import { isStormCode, isWetHour } from './briefing'
import { demoDaily, demoHourly } from './demo-weather'

const days = [
  { date: '2026-11-10', code: 63, max: 17, min: 13, wet: [11, 17] as [number, number] },
  { date: '2026-11-11', code: 95, max: 16, min: 12, wet: [10, 16] as [number, number] },
  { date: '2026-11-12', code: 0, max: 21, min: 13 },
]

describe('demoHourly', () => {
  it('pada tylko w godzinach opadu, burza z kodem burzy', () => {
    const { hours } = demoHourly(days)
    const wet = (date: string) =>
      hours
        .filter((h) => h.time.startsWith(date) && isWetHour(h.rain, h.mm))
        .map((h) => h.time.slice(11, 13))
    expect(wet('2026-11-10')).toEqual(['11', '12', '13', '14', '15', '16'])
    expect(wet('2026-11-12')).toEqual([])
    const storm = hours.filter((h) => h.time.startsWith('2026-11-11') && isStormCode(h.code))
    expect(storm).toHaveLength(6)
  })

  it('temperatura w zakresie dnia, maksimum po południu', () => {
    const { hours } = demoHourly(days)
    const sunny = hours.filter((h) => h.time.startsWith('2026-11-12'))
    expect(Math.max(...sunny.map((h) => h.temp))).toBe(21)
    expect(Math.min(...sunny.map((h) => h.temp))).toBe(13)
  })
})

describe('demoDaily', () => {
  it('teraz z dnia dzisiejszego', () => {
    const w = demoDaily(days, new Date(2026, 10, 10, 12))
    expect(w.current?.code).toBe(63)
    expect(w.daily).toHaveLength(3)
  })
})

import { describe, expect, it } from 'vitest'
import { routesMonthlyLimit } from './routes-budget'

describe('routesMonthlyLimit', () => {
  it('0 zł to tylko darmowa pula', () => {
    expect(routesMonthlyLimit(0)).toBe(1000)
  })

  it('kwota dokłada zapytania po najwyższej cenie', () => {
    expect(routesMonthlyLimit(10)).toBe(1148)
    expect(routesMonthlyLimit(50)).toBe(1740)
  })

  it('zła wartość z env nie zdejmuje blokady', () => {
    expect(routesMonthlyLimit(Number.NaN)).toBe(1000)
    expect(routesMonthlyLimit(-5)).toBe(1000)
    expect(routesMonthlyLimit(Number.POSITIVE_INFINITY)).toBe(1000)
  })
})

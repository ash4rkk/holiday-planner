import { describe, expect, it } from 'vitest'
import { addDays, dateRange, formatDateSpan, isIsoDate, isIsoTime } from './dates'

describe('dates', () => {
  it('liczy dni przez przełom miesiąca i zmianę czasu', () => {
    expect(addDays('2027-03-27', 2)).toBe('2027-03-29')
    expect(dateRange('2027-07-30', '2027-08-02')).toEqual([
      '2027-07-30',
      '2027-07-31',
      '2027-08-01',
      '2027-08-02',
    ])
    expect(dateRange('2027-08-02', '2027-07-30')).toEqual([])
  })

  it('waliduje datę i godzinę', () => {
    expect(isIsoDate('2027-07-14')).toBe(true)
    expect(isIsoDate('2027-13-01')).toBe(false)
    expect(isIsoTime('23:59')).toBe(true)
    expect(isIsoTime('24:00')).toBe(false)
  })

  it('formatuje zakres dat', () => {
    expect(formatDateSpan('2027-07-14', '2027-07-21')).toBe('14–21 lipca 2027')
    expect(formatDateSpan(null, null)).toBe('bez dat')
  })
})

import { describe, expect, it } from 'vitest'
import {
  easter,
  freeSpan,
  holidayOn,
  holidays,
  holidaysBetween,
  isWorkday,
  leaveDays,
  leaveInYear,
} from './holidays'

describe('holidays', () => {
  it('liczy Wielkanoc', () => {
    expect(easter(2025)).toBe('2025-04-20')
    expect(easter(2026)).toBe('2026-04-05')
    expect(easter(2027)).toBe('2027-03-28')
    expect(easter(2028)).toBe('2028-04-16')
  })

  it('zna ruchome święta w Polsce', () => {
    expect(holidayOn('2027-05-27', 'PL')?.name).toBe('Boże Ciało')
    expect(holidayOn('2026-06-04', 'PL')?.name).toBe('Boże Ciało')
    expect(holidayOn('2027-03-29', 'PL')?.name).toBe('Poniedziałek Wielkanocny')
    expect(holidays('PL', 2027)).toHaveLength(14)
  })

  it('Wigilia wolna od 2025', () => {
    expect(holidayOn('2024-12-24', 'PL')).toBeUndefined()
    expect(holidayOn('2025-12-24', 'PL')?.name).toBe('Wigilia')
  })

  it('zna święta Brandenburgii', () => {
    expect(holidayOn('2027-03-26', 'DE-BB')?.localName).toBe('Karfreitag')
    expect(holidayOn('2027-05-06', 'DE-BB')?.localName).toBe('Christi Himmelfahrt')
    expect(holidayOn('2027-05-17', 'DE-BB')?.localName).toBe('Pfingstmontag')
    expect(holidayOn('2027-10-31', 'DE-BB')?.localName).toBe('Reformationstag')
    expect(holidays('DE-BB', 2027)).toHaveLength(12)
  })

  it('dzień roboczy zależy od regionu', () => {
    expect(isWorkday('2027-05-03', 'PL')).toBe(false)
    expect(isWorkday('2027-05-03', 'DE-BB')).toBe(true)
    expect(isWorkday('2028-10-03', 'PL')).toBe(true)
    expect(isWorkday('2028-10-03', 'DE-BB')).toBe(false)
    expect(isWorkday('2027-05-08', 'PL')).toBe(false) // sobota
  })

  it('liczy dni urlopu i wolnego', () => {
    // majówka 2026: pt 1.05, nd 3.05; urlop pn–śr 4–6 maja
    expect(leaveDays('2026-05-04', '2026-05-06', 'PL')).toBe(3)
    // wolne od pt 1.05 do śr 6.05
    expect(freeSpan('2026-05-04', '2026-05-06', 'PL')).toBe(6)
    // tydzień pn–pt w maju 2027 w PL: 3.05 święto
    expect(leaveDays('2027-05-03', '2027-05-07', 'PL')).toBe(4)
    // w Brandenburgii 3.05 roboczy, ale czw 6.05 to Wniebowstąpienie
    expect(leaveDays('2027-05-03', '2027-05-07', 'DE-BB')).toBe(4)
    expect(leaveDays('2027-05-10', '2027-05-14', 'DE-BB')).toBe(5)
    expect(freeSpan('2027-05-04', '2027-05-07', 'PL')).toBe(9)
  })

  it('dzieli okres na przełomie lat', () => {
    const periods = [{ startDate: '2026-12-28', endDate: '2027-01-08' }]
    // 2026: pn 28 – czw 31 = 4 dni
    expect(leaveInYear(periods, 2026, 'PL')).toBe(4)
    // 2027: 1.01 święto (pt), 6.01 święto (śr); pn 4, wt 5, czw 7, pt 8 = 4 dni
    expect(leaveInYear(periods, 2027, 'PL')).toBe(4)
  })

  it('zwraca święta w zakresie przez dwa lata', () => {
    const list = holidaysBetween('PL', '2026-12-20', '2027-01-10').map((h) => h.date)
    expect(list).toEqual(['2026-12-24', '2026-12-25', '2026-12-26', '2027-01-01', '2027-01-06'])
  })
})

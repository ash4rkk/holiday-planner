import { describe, expect, it } from 'vitest'
import { arrivalFromText, arrivalLabel, placeLine, spanMin } from './cards'

const train = { type: 'transport' as const, date: '2026-12-26', time: '08:54' }

describe('spanMin', () => {
  it('transport: od odjazdu do przyjazdu', () => {
    expect(spanMin({ ...train, endTime: '19:49' })).toBe(655)
  })
  it('nocny przejazd: z endDate albo przyjazd „przed” odjazdem', () => {
    expect(spanMin({ ...train, time: '22:10', endTime: '07:05', endDate: '2026-12-27' })).toBe(535)
    expect(spanMin({ ...train, time: '22:10', endTime: '07:05' })).toBe(535)
  })
  it('bez przyjazdu i dla innych kart: czas trwania', () => {
    expect(spanMin({ ...train, durationMin: 90 })).toBe(90)
    expect(spanMin({ type: 'sight', time: '10:00', endTime: '12:00', durationMin: 30 })).toBe(30)
    expect(spanMin(train)).toBeUndefined()
  })
})

describe('arrivalLabel', () => {
  it('ten sam dzień i następny', () => {
    expect(arrivalLabel({ ...train, endTime: '19:49' })).toBe('19:49')
    expect(arrivalLabel({ ...train, endTime: '07:05', endDate: '2026-12-27' })).toBe(
      '07:05 (27 gru)',
    )
    expect(arrivalLabel(train)).toBeUndefined()
  })
})

describe('placeLine', () => {
  it('transport: start → cel', () => {
    const location = { name: 'Warszawa Centralna' }
    const destination = { name: 'Budapest Nyugati' }
    expect(placeLine({ type: 'transport', location, destination })).toBe(
      'Warszawa Centralna → Budapest Nyugati',
    )
    expect(placeLine({ type: 'transport', destination })).toBe('→ Budapest Nyugati')
    expect(placeLine({ type: 'sight', location, destination })).toBe('Warszawa Centralna')
  })
})

describe('arrivalFromText', () => {
  it.each([
    ['Odjazd / przyjazd: 08:54 → 19:49', '19:49'],
    ['08:12 - 19:37', '19:37'],
    ['Przyjazd: 7:05', '07:05'],
    ['przylot 23.40', '23:40'],
    ['Arrival 12:30', '12:30'],
    ['Wagon: 352, miejsca 65 i 66', undefined],
  ])('%s', (text, want) => {
    expect(arrivalFromText(text)).toBe(want)
  })
})

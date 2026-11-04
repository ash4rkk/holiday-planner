import { describe, expect, it } from 'vitest'
import type { CardSnapshot } from './cards'
import { dayGaps } from './gaps'

const place = { name: 'x', lat: 1, lng: 2 }
const card = (id: string, fields: Partial<CardSnapshot>) =>
  ({ id, type: 'sight', date: '2027-07-14', ...fields }) as CardSnapshot

describe('dayGaps', () => {
  it('liczy przerwę z czasu trwania i podaje trasę, gdy obie karty mają miejsce', () => {
    const [gap] = dayGaps([
      card('a', { time: '11:30', durationMin: 120, location: place }),
      card('b', { time: '14:00', location: place }),
    ])
    expect(gap).toMatchObject({ from: 'a', to: 'b', freeMin: 30, leaveAt: '13:30' })
    expect(gap?.route).toBeDefined()
  })

  it('wykrywa nakładanie się', () => {
    const [gap] = dayGaps([
      card('a', { time: '10:00', durationMin: 90 }),
      card('b', { time: '11:00' }),
    ])
    expect(gap?.freeMin).toBe(-30)
    expect(gap?.route).toBeUndefined()
  })

  it('pomija noclegi i karty bez godziny, układa po czasie', () => {
    const gaps = dayGaps([
      card('b', { time: '14:00' }),
      card('stay', { type: 'stay', time: '12:00' }),
      card('note', { type: 'note' }),
      card('a', { time: '09:00' }),
    ])
    expect(gaps.map((g) => [g.from, g.to])).toEqual([['a', 'b']])
  })

  it('po transporcie nie ma trasy, bo nie wiadomo, gdzie się kończy', () => {
    const [gap] = dayGaps([
      card('a', { type: 'transport', time: '09:00', location: place }),
      card('b', { time: '12:00', location: place }),
    ])
    expect(gap?.route).toBeUndefined()
  })

  it('bez czasu trwania liczy 0 minut', () => {
    const [gap] = dayGaps([card('a', { time: '09:00' }), card('b', { time: '09:45' })])
    expect(gap).toMatchObject({ freeMin: 45, leaveAt: '09:00' })
  })
})

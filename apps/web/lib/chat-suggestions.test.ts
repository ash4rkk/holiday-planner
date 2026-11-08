import type { CardSnapshot } from '@planer/core'
import { describe, expect, it } from 'vitest'
import { chatSuggestions } from './chat-suggestions'

const card = (p: Partial<CardSnapshot>) =>
  ({ id: 'x', title: '', type: 'note', ...p }) as CardSnapshot
const trip = { startDate: '2027-07-14', endDate: '2027-07-16' }

describe('chatSuggestions', () => {
  it('przed wyjazdem: braki, rezerwacje i wolny dzień', () => {
    const s = chatSuggestions(
      trip,
      [card({ date: '2027-07-14', status: 'missing' }), card({ date: '2027-07-15' })],
      '2027-07-01',
    )
    expect(s).toContain('co trzeba jeszcze zarezerwować?')
    expect(s.some((x) => x.startsWith('co robić 16 lip'))).toBe(true)
  })

  it('w trakcie: dziś, jutro i najbliższy przejazd', () => {
    const s = chatSuggestions(
      trip,
      [card({ date: '2027-07-15', type: 'transport', title: 'pociąg do Neapolu', time: '09:00' })],
      '2027-07-14',
    )
    expect(s.slice(0, 2)).toEqual(['co mamy dziś?', 'co mamy jutro?'])
    expect(s).toContain('czy zdążymy na: pociąg do Neapolu?')
    expect(s.length).toBeLessThanOrEqual(5)
  })

  it('po wyjeździe i bez dat', () => {
    expect(chatSuggestions(trip, [], '2027-08-01')[0]).toBe('ile wydaliśmy łącznie?')
    expect(chatSuggestions({}, [], '2027-08-01')[0]).toBe('zaproponuj plan na 3 dni')
  })
})

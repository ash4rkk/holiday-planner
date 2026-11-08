import { describe, expect, it } from 'vitest'
import type { AttachmentMeta } from './attachments'
import type { CardSnapshot } from './cards'
import { dayTickets } from './tickets'

const card = (p: Partial<CardSnapshot>) => ({ title: '', type: 'note', ...p }) as CardSnapshot
const file = (id: string, cardId: string, createdAt = '2027-01-01T00:00:00Z') =>
  ({ id, cardId, name: `${id}.pdf`, mime: 'application/pdf', size: 1, createdAt }) as AttachmentMeta

describe('dayTickets', () => {
  it('karty z plikami po godzinie, trzy dni od startu, bez kosza i wariantów', () => {
    const cards = [
      card({ id: 'muzeum', date: '2027-07-14', time: '15:00' }),
      card({ id: 'lot', date: '2027-07-14', time: '07:10' }),
      card({ id: 'bez-plikow', date: '2027-07-14', time: '08:00' }),
      card({ id: 'kosz', date: '2027-07-14', deletedAt: '2027-07-01' }),
      card({ id: 'wariant', date: '2027-07-14', variantOf: 'muzeum' }),
      card({ id: 'pociag', date: '2027-07-16' }),
    ]
    const files = [
      file('b', 'lot', '2027-01-02T00:00:00Z'),
      file('a', 'lot'),
      file('m', 'muzeum'),
      file('k', 'kosz'),
      file('w', 'wariant'),
      file('p', 'pociag'),
    ]
    const days = dayTickets(cards, files, '2027-07-14')
    expect(days.map((d) => d.date)).toEqual(['2027-07-14', '2027-07-15', '2027-07-16'])
    expect(days[0]?.items.map((i) => i.card.id)).toEqual(['lot', 'muzeum'])
    expect(days[0]?.items[0]?.files.map((f) => f.id)).toEqual(['a', 'b'])
    expect(days[1]?.items).toEqual([])
    expect(days[2]?.items.map((i) => i.card.id)).toEqual(['pociag'])
  })
})

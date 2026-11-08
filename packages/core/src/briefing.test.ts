import { describe, expect, it } from 'vitest'
import type { AttachmentMeta } from './attachments'
import { cardsInRain, composeBriefing, rainSpans } from './briefing'
import type { CardSnapshot } from './cards'

const card = (p: Partial<CardSnapshot>) => ({ title: '', type: 'note', ...p }) as CardSnapshot
const date = '2027-07-15'

describe('wieczorne podsumowanie', () => {
  it('pierwsza karta z godziną wyjścia, bilety, rezerwacje i deszcz', () => {
    const b = composeBriefing({
      date,
      cards: [
        card({ id: 'k', date, time: '15:00', title: 'Koloseum', status: 'missing' }),
        card({ id: 'p', date, time: '09:10', title: 'Pociąg do Neapolu' }),
        card({ id: 'x', date, time: '08:00', title: 'w koszu', deletedAt: '2027-07-01' }),
      ],
      attachments: [{ id: 'f', cardId: 'p' } as AttachmentMeta],
      leaveBy: '08:35',
      forecast: { max: 27.6, min: 18.2, rain: 70, rainHours: ['14', '15', '19'] },
    })
    expect(b?.title).toBe('jutro · czw., 15 lipca')
    expect(b?.body.split('\n')).toEqual([
      '09:10 Pociąg do Neapolu · wyjdź o 08:35',
      'w planie 2 karty',
      'bilety w 1 karcie',
      'do rezerwacji: Koloseum',
      '28°/18° · deszcz 14–16, 19–20',
    ])
  })

  it('bez kart na jutro nic nie wysyła', () => {
    expect(
      composeBriefing({ date, cards: [card({ date: '2027-07-16' })], attachments: [] }),
    ).toBeNull()
  })

  it('przedziały godzin deszczu', () => {
    expect(rainSpans(['09', '10', '11', '20'])).toBe('9–12, 20–21')
    expect(rainSpans([])).toBe('')
  })
})

describe('karty w deszczu', () => {
  it('czas trwania zahacza o godzinę deszczu; bez godziny i z innego dnia — nie', () => {
    const cards = [
      card({ id: 'rano', date, time: '09:00', durationMin: 90 }),
      card({ id: 'park', date, time: '13:30', durationMin: 60 }),
      card({ id: 'kolacja', date, time: '20:00' }),
      card({ id: 'bez-godziny', date }),
      card({ id: 'jutro', date: '2027-07-16', time: '14:00' }),
    ]
    expect(cardsInRain(cards, date, ['14', '15']).map((c) => c.id)).toEqual(['park'])
    expect(cardsInRain(cards, date, ['10', '20']).map((c) => c.id)).toEqual(['rano', 'kolacja'])
    expect(cardsInRain(cards, date, [])).toEqual([])
  })
})

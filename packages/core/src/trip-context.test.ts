import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { attachFile } from './attachments'
import { tripContext } from './trip-context'
import { createCard, trashCard } from './trip-doc'

describe('tripContext', () => {
  it('dni, pola, kwoty, miejsca, pliki z identyfikatorami; bez kosza', () => {
    const doc = new Y.Doc()
    const flight = createCard(
      doc,
      {
        type: 'transport',
        date: '2027-07-14',
        time: '10:00',
        status: 'booked',
        location: { name: 'Lotnisko Chopina', lat: 52.1657, lng: 20.9671 },
      },
      new Date(),
      'Lot LO 319\nterminal A /+300',
    )
    attachFile(doc, {
      id: 'f1',
      cardId: flight,
      name: 'bilet.pdf',
      mime: 'application/pdf',
      size: 1,
      createdAt: '2027-01-01',
    })
    createCard(doc, { type: 'note' }, new Date(), 'Lista rzeczy\npaszport')
    const gone = createCard(doc, { type: 'food', date: '2027-07-15' }, new Date(), 'Usunięta')
    trashCard(doc, gone)

    const text = tripContext(
      doc,
      {
        title: 'Rzym',
        startDate: '2027-07-14',
        endDate: '2027-07-15',
        currencies: ['EUR'],
        timezone: 'Europe/Rome',
      },
      { EUR: 4.3 },
    )
    expect(text).toContain('# Wyjazd: Rzym (14–15 lipca 2027)')
    expect(text).toContain(
      'waluty: PLN, EUR (główna: EUR) · strefa czasowa: Europe/Rome · kursy NBP (ostatnie): 1 EUR = 4.3000 zł',
    )
    expect(text).toContain(`- [transport] **Lot LO 319** (card:${flight})`)
    expect(text).toMatch(
      /godz\. 10:00 · zarezerwowane · miejsce: Lotnisko Chopina \[52\.16570,20\.96710\] · kwoty: 300\sz/,
    )
    expect(text).toContain('  > terminal A /+300')
    expect(text).toContain('  plik: bilet.pdf (att:f1, PDF)')
    expect(text).toContain('## czw., 15 lipca (2027-07-15) · dzień 2\n\n(nic nie zaplanowano)')
    expect(text).toContain('## Pomysły (bez dnia')
    expect(text).not.toContain('Usunięta')
  })

  it('duży wyjazd: treść kart skrócona', () => {
    const doc = new Y.Doc()
    const long = Array.from({ length: 40 }, (_, i) => `linia ${i} ${'x'.repeat(80)}`).join('\n')
    for (let i = 0; i < 30; i++)
      createCard(doc, { type: 'note' }, new Date(), `Karta ${i}\n${long}`)
    const text = tripContext(doc, { title: 'Duży', currencies: [] })
    expect(text.length).toBeLessThanOrEqual(60_000)
    expect(text).toContain('> linia 2 ')
    expect(text).toContain('… (37 linii więcej)')
  })
})

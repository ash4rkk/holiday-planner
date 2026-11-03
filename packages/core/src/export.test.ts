import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { attachFile } from './attachments'
import { exportHtml, exportMarkdown, exportModel } from './export'
import { createCard, trashCard } from './trip-doc'

function doc() {
  const d = new Y.Doc()
  const lot = createCard(
    d,
    {
      type: 'transport',
      date: '2027-07-14',
      time: '10:00',
      status: 'booked',
      location: { name: 'Lotnisko Chopina' },
    },
    new Date(),
    'Lot LO 319\nodprawa do 8:30 /+300',
  )
  attachFile(d, {
    id: 'a1',
    cardId: lot,
    name: 'bilet.pdf',
    mime: 'application/pdf',
    size: 1,
    createdAt: 'x',
  })
  createCard(
    d,
    { type: 'food', date: '2027-07-15', time: '20:00' },
    new Date(),
    'Trattoria <Monti>\n/+40 eur',
  )
  createCard(d, { type: 'note', pinned: true }, new Date(), 'Lista rzeczy')
  trashCard(d, createCard(d, { type: 'sight', date: '2027-07-14' }, new Date(), 'Usunięta'))
  return d
}
const trip = { title: 'Rzym', startDate: '2027-07-14', endDate: '2027-07-16', currencies: ['EUR'] }
const rate = (c: string) => (c === 'EUR' ? 4.3 : undefined)

describe('eksport', () => {
  it('Markdown dzień po dniu z sumami, bez kosza', () => {
    const md = exportMarkdown(exportModel(doc(), trip), rate, '2027-07-01')
    expect(md).toMatch(/^# Rzym\n\n\*14–16 lipca 2027 · wydatki: 472\s?zł · ≈ 109,77\s?€\*/)
    expect(md).toContain('## Przypięte\n\n### Lista rzeczy')
    expect(md).toMatch(/## śr\., 14 lipca · dzień 1 · 300\s?zł/)
    expect(md).toMatch(
      /### Lot LO 319\n\n\*transport · 10:00 · potwierdzone · ⌖ Lotnisko Chopina · 300\s?zł\*\n\nodprawa do 8:30 \/\+300\n\nZałączniki: bilet\.pdf/,
    )
    expect(md).toContain('## pt., 16 lipca · dzień 3\n\n*(nic nie zaplanowano)*')
    expect(md).not.toContain('Usunięta')
  })

  it('HTML z ucieczką, bez plików dla linku publicznego', () => {
    const html = exportHtml(exportModel(doc(), trip, { files: false }), rate, '2027-07-01', {
      printButton: true,
    })
    expect(html).toContain('<h3>Trattoria &lt;Monti&gt;</h3>')
    expect(html).toContain('class="t-food"')
    expect(html).not.toContain('bilet.pdf')
    expect(html).toContain('drukuj / zapisz PDF')
  })
})

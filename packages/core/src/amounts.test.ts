import { describe, expect, it } from 'vitest'
import {
  formatAmount,
  parseAmounts,
  spendingByDay,
  sumByCurrency,
  totals,
  withoutAmounts,
} from './amounts'

describe('parseAmounts', () => {
  it.each([
    ['bilet /+300', [{ value: 300, currency: 'PLN' }]],
    [
      '/+50EUR i /+20 chf',
      [
        { value: 50, currency: 'EUR' },
        { value: 20, currency: 'CHF' },
      ],
    ],
    [
      '/+50€ /+12,50 zł /+9.99$',
      [
        { value: 50, currency: 'EUR' },
        { value: 12.5, currency: 'PLN' },
        { value: 9.99, currency: 'USD' },
      ],
    ],
    ['/+300 obiad w trattorii', [{ value: 300, currency: 'PLN' }]],
    ['/+40 eur.', [{ value: 40, currency: 'EUR' }]],
    ['/+0 i +50 i 50zł', []],
    ['/+1200,5 PLN', [{ value: 1200.5, currency: 'PLN' }]],
    ['3 noce /+900Hotel', [{ value: 900, currency: 'PLN' }]],
    [
      '/+300obiad /+30Muzea',
      [
        { value: 300, currency: 'PLN' },
        { value: 30, currency: 'PLN' },
      ],
    ],
  ])('%s', (text, expected) => expect(parseAmounts(text)).toEqual(expected))
})

describe('sumy', () => {
  it('suma per waluta', () => {
    expect(sumByCurrency(parseAmounts('/+10 /+0,1eur /+5 /+0,2eur'))).toEqual([
      { currency: 'PLN', value: 15 },
      { currency: 'EUR', value: 0.3 },
    ])
  })

  it('PLN i waluta główna po kursie z daty karty; przyszłość i brak daty po dzisiejszym', () => {
    const rates: Record<string, number> = {
      'EUR|2027-07-10': 4.3,
      'EUR|2027-07-20': 4.5,
      'CHF|2027-07-20': 5,
    }
    const rate = (c: string, d: string) => rates[`${c}|${d}`]
    const t = totals(
      [
        { amounts: [{ value: 100, currency: 'EUR' }], date: '2027-07-10' }, // 430
        { amounts: [{ value: 10, currency: 'EUR' }], date: '2027-08-01' }, // przyszłość → 4.5 = 45
        { amounts: [{ value: 25, currency: 'PLN' }] },
        { amounts: [{ value: 2, currency: 'CHF' }] }, // 10
        { amounts: [{ value: 7, currency: 'XYZ' }] },
        { amounts: [{ value: 999, currency: 'PLN' }], deletedAt: 'x' },
      ],
      rate,
      '2027-07-20',
      'EUR',
    )
    expect(t).toEqual({
      pln: 510,
      main: { currency: 'EUR', value: 113.33 },
      unconverted: [{ currency: 'XYZ', value: 7 }],
    })
  })

  it('format po polsku (twarda spacja przed walutą)', () => {
    const plain = (s: string) => s.replace(/\u00a0/g, ' ')
    expect(plain(formatAmount({ value: 300, currency: 'PLN' }))).toBe('300 zł')
    expect(plain(formatAmount({ value: 12.5, currency: 'EUR' }))).toBe('12,50 €')
  })
})

describe('withoutAmounts', () => {
  it('usuwa składnię kwot i zostawia resztę zdania', () => {
    expect(withoutAmounts('Bilety online. /+30 EUR')).toBe('Bilety online.')
    expect(withoutAmounts('obiad /+12,50 chf na rynku')).toBe('obiad na rynku')
    expect(withoutAmounts('/+45 EUR')).toBe('')
  })
})

describe('spendingByDay', () => {
  it('suma w PLN na dzień, bez kart usuniętych i bez daty', () => {
    const rate = (c: string) => (c === 'EUR' ? 4 : undefined)
    const days = spendingByDay(
      [
        { amounts: [{ value: 10, currency: 'EUR' }], date: '2027-07-01' },
        { amounts: [{ value: 5, currency: 'PLN' }], date: '2027-07-01' },
        { amounts: [{ value: 100, currency: 'PLN' }], date: '2027-07-02', deletedAt: 'x' },
        { amounts: [{ value: 50, currency: 'PLN' }] },
      ],
      rate,
      '2027-07-05',
      ['2027-07-01', '2027-07-02'],
    )
    expect(days).toEqual([45, 0])
  })
})

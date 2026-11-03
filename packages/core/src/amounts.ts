import type { CardSnapshot } from './cards'

// Kwoty w treści kart: `/+300` (PLN), `/+50EUR`, `/+50 €`, `/+12,50 chf`. Kwoty z jednej karty się
// sumują; sumy dnia i wyjazdu w PLN i walucie głównej wyjazdu po kursie NBP z daty karty.
// Nic z tego nie jest zapisywane — liczy się z treści przy każdym odczycie.

export type Amount = { value: number; currency: string }

const SYMBOLS: Record<string, string> = { zł: 'PLN', zl: 'PLN', '€': 'EUR', $: 'USD', '£': 'GBP' }

// Waluta: symbol albo trzy litery, ale nie początek zwykłego słowa („/+300 obiad” to 300 PLN).
// Warunek „nie słowo” dotyczy tylko waluty — sama liczba się nie skraca („/+900Hotel” to 900, nie 90).
const AMOUNT = /\/\+(\d+(?:[.,]\d{1,2})?)(?!\d)(?:\s?(zł|zl|€|\$|£|[a-z]{3})(?![a-ząćęłńóśźż]))?/gi

export function parseAmounts(text: string): Amount[] {
  const out: Amount[] = []
  for (const m of text.matchAll(AMOUNT)) {
    const value = Number((m[1] as string).replace(',', '.'))
    if (!Number.isFinite(value) || value <= 0) continue
    const raw = m[2]?.toLowerCase()
    out.push({ value, currency: raw ? (SYMBOLS[raw] ?? raw.toUpperCase()) : 'PLN' })
  }
  return out
}

/** Suma per waluta, w kolejności pierwszego wystąpienia. */
export function sumByCurrency(amounts: Amount[]): Amount[] {
  const sums = new Map<string, number>()
  for (const a of amounts) sums.set(a.currency, round2((sums.get(a.currency) ?? 0) + a.value))
  return [...sums].map(([currency, value]) => ({ currency, value }))
}

export const round2 = (n: number) => Math.round(n * 100) / 100

/** Kurs: ile PLN za 1 jednostkę waluty w danym dniu (PLN → 1). Brak kursu → undefined. */
export type RateLookup = (currency: string, date: string) => number | undefined

export type Totals = {
  /** Suma w PLN (tylko kwoty, dla których znamy kurs). */
  pln: number
  /** Suma w walucie głównej wyjazdu (undefined, gdy główną jest PLN albo brak jej kursu). */
  main?: Amount
  /** Kwoty bez kursu (np. nieznana waluta) — pokazywane osobno. */
  unconverted: Amount[]
}

/**
 * Sumy kart w PLN i walucie głównej. Kurs z daty karty; karty bez daty i daty z przyszłości —
 * kurs z dzisiaj (`today`), bo NBP nie publikuje kursów naprzód.
 */
export function totals(
  cards: Pick<CardSnapshot, 'amounts' | 'date' | 'deletedAt'>[],
  rate: RateLookup,
  today: string,
  mainCurrency = 'PLN',
): Totals {
  let pln = 0
  const unconverted: Amount[] = []
  for (const card of cards) {
    if (card.deletedAt) continue
    const date = card.date && card.date <= today ? card.date : today
    for (const a of card.amounts ?? []) {
      const r = a.currency === 'PLN' ? 1 : rate(a.currency, date)
      if (r === undefined) unconverted.push(a)
      else pln += a.value * r
    }
  }
  pln = round2(pln)
  const mainRate = mainCurrency === 'PLN' ? undefined : rate(mainCurrency, today)
  return {
    pln,
    main: mainRate ? { currency: mainCurrency, value: round2(pln / mainRate) } : undefined,
    unconverted: sumByCurrency(unconverted),
  }
}

export function formatAmount({ value, currency }: Amount): string {
  try {
    return new Intl.NumberFormat('pl-PL', {
      style: 'currency',
      currency,
      minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(value)
  } catch {
    return `${value.toLocaleString('pl-PL')} ${currency}`
  }
}

import { and, eq, gte, lte } from 'drizzle-orm'
import { addDays } from './dates'
import { fxRates, getDb } from './db'

// Kursy NBP (tabela A) z cache w fx_rates. Tylko po stronie serwera (web API i worker).
// NBP nie publikuje w weekendy i święta, więc kurs „z dnia” to ostatni opublikowany do tego dnia.

const NBP = 'https://api.nbp.pl/api/exchangerates/rates/a'
/** Najdłuższa przerwa w publikacji (długi weekend + święta) — dalej uznajemy, że kursu brak w cache. */
const MAX_GAP_DAYS = 7

export type RateRequest = { currency: string; date: string }

// Przed publikacją dzisiejszego kursu każde zapytanie wyglądałoby na „brak w cache” — nie pytamy
// NBP o tę samą walutę częściej niż co 10 minut.
const lastAttempt = new Map<string, number>()
const RETRY_MS = 10 * 60_000

type Row = { date: string; rate: number }

async function fetchNbp(currency: string, from: string, to: string): Promise<Row[]> {
  const url = `${NBP}/${currency.toLowerCase()}/${from}/${to}/?format=json`
  const res = await fetch(url, {
    signal: AbortSignal.timeout(8000),
    headers: { accept: 'application/json' },
  })
  if (res.status === 404) return [] // brak publikacji w zakresie albo waluta spoza tabeli A
  if (!res.ok) throw new Error(`NBP ${res.status}`)
  const body = (await res.json()) as { rates: { effectiveDate: string; mid: number }[] }
  return body.rates.map((r) => ({ date: r.effectiveDate, rate: r.mid }))
}

async function cached(currency: string, from: string, to: string): Promise<Row[]> {
  const rows = await getDb()
    .select({ date: fxRates.date, rate: fxRates.ratePln })
    .from(fxRates)
    .where(and(eq(fxRates.currency, currency), gte(fxRates.date, from), lte(fxRates.date, to)))
  return rows.sort((a, b) => a.date.localeCompare(b.date))
}

const lastUpTo = (rows: Row[], date: string) => rows.filter((r) => r.date <= date).at(-1)

/**
 * Kursy dla par (waluta, dzień). Daty z przyszłości → kurs z `today`. Wynik: klucz `EUR|2027-07-14`
 * → PLN za 1 EUR; brak klucza = brak kursu (nieznana waluta albo NBP niedostępny i pusty cache).
 */
export async function getRates(
  requests: RateRequest[],
  today: string,
): Promise<Record<string, number>> {
  const out: Record<string, number> = {}
  // Daty z zapytania (klucze odpowiedzi) per waluta; kursy szukamy dla dat przyciętych do dziś.
  const byCurrency = new Map<string, string[]>()
  for (const { currency, date } of requests) {
    const code = currency.toUpperCase()
    if (code === 'PLN' || !/^[A-Z]{3}$/.test(code)) continue
    const list = byCurrency.get(code) ?? []
    list.push(date)
    byCurrency.set(code, list)
  }

  for (const [currency, dates] of byCurrency) {
    const sorted = [...new Set(dates.map((d) => (d > today ? today : d)))].sort()
    const from = addDays(sorted[0] as string, -MAX_GAP_DAYS)
    const to = sorted.at(-1) as string
    let rows = await cached(currency, from, to)
    const missing = sorted.some((d) => {
      const hit = lastUpTo(rows, d)
      // Dzisiejszy kurs dociągamy, gdy w cache jest starszy niż wczoraj (NBP publikuje ok. 12:00).
      return !hit || hit.date < addDays(d, d === today ? -1 : -MAX_GAP_DAYS)
    })
    if (missing && Date.now() - (lastAttempt.get(currency) ?? 0) > RETRY_MS) {
      lastAttempt.set(currency, Date.now())
      try {
        // NBP przyjmuje zakres do 367 dni; dłuższe wyjazdy to rzadkość — wtedy tylko ostatni rok.
        const start = from < addDays(to, -360) ? addDays(to, -360) : from
        const fresh = await fetchNbp(currency, start, to)
        if (fresh.length) {
          await getDb()
            .insert(fxRates)
            .values(fresh.map((r) => ({ currency, date: r.date, ratePln: r.rate })))
            .onConflictDoNothing()
          rows = await cached(currency, from, to)
        }
      } catch (error) {
        console.warn(`[fx] NBP ${currency}: ${String(error)}`)
      }
    }
    for (const d of new Set(dates)) {
      const effective = d > today ? today : d
      const hit = lastUpTo(rows, effective)
      if (hit && hit.date >= addDays(effective, -MAX_GAP_DAYS)) out[`${currency}|${d}`] = hit.rate
    }
  }
  return out
}

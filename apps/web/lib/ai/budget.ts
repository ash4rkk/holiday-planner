import 'server-only'
import { aiUsage, and, getDb, gte, sql } from '@planer/core/db'
import { getRates } from '@planer/core/fx'

// Koszt wywołań AI w złotych i limit miesięczny (domyślnie ok. 20 zł). Ceny w USD za 1 mln tokenów;
// zapis do cache to 1,25× ceny wejścia, wyszukiwanie w sieci $10 za 1000 zapytań.

type Price = { input: number; output: number; cacheRead: number }
const PRICES: Record<string, Price> = {
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2 },
  'claude-opus-5': { input: 5, output: 25, cacheRead: 0.5 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2 },
  'claude-sonnet-5': { input: 2, output: 10, cacheRead: 0.2 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01 },
}
// Nieznany model liczymy po cenach Opusa (ostrożnie — limit raczej za wcześnie niż za późno).
const FALLBACK_PRICE = PRICES['claude-opus-5-5'] as Price
const WEB_SEARCH_USD = 0.01
const USD_PLN_FALLBACK = 4.2

export const MONTHLY_BUDGET_PLN = Number(process.env.AI_MONTHLY_BUDGET_PLN ?? 20)

export type UsageLike = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens?: number | null
  cache_creation_input_tokens?: number | null
  server_tool_use?: { web_search_requests?: number | null } | null
}

export function costUsd(model: string, u: UsageLike): number {
  const p = PRICES[model] ?? FALLBACK_PRICE
  return (
    (u.input_tokens * p.input +
      (u.cache_creation_input_tokens ?? 0) * p.input * 1.25 +
      (u.cache_read_input_tokens ?? 0) * p.cacheRead +
      u.output_tokens * p.output) /
      1_000_000 +
    (u.server_tool_use?.web_search_requests ?? 0) * WEB_SEARCH_USD
  )
}

async function usdPln(): Promise<number> {
  const today = Temporal.Now.plainDateISO('Europe/Warsaw').toString()
  const rates = await getRates([{ currency: 'USD', date: today }], today).catch(() => ({}))
  return (rates as Record<string, number>)[`USD|${today}`] ?? USD_PLN_FALLBACK
}

const monthStart = () => {
  const now = Temporal.Now.plainDateISO('Europe/Warsaw')
  return new Date(`${now.toPlainYearMonth().toString()}-01T00:00:00+01:00`)
}

/** Wydatki AI w bieżącym miesiącu (zł). */
export async function spentThisMonthPln(): Promise<number> {
  const [row] = await getDb()
    .select({ total: sql<number>`coalesce(sum(${aiUsage.costPln}), 0)` })
    .from(aiUsage)
    .where(and(gte(aiUsage.createdAt, monthStart())))
  return Number(row?.total ?? 0)
}

export async function budgetLeftPln(): Promise<number> {
  return MONTHLY_BUDGET_PLN - (await spentThisMonthPln())
}

export async function recordUsage(entry: {
  userId: string
  kind: 'chat' | 'import'
  model: string
  usage: UsageLike
}) {
  const pln = costUsd(entry.model, entry.usage) * (await usdPln())
  await getDb()
    .insert(aiUsage)
    .values({
      userId: entry.userId,
      kind: entry.kind,
      model: entry.model,
      inputTokens: entry.usage.input_tokens,
      outputTokens: entry.usage.output_tokens,
      cacheReadTokens: entry.usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: entry.usage.cache_creation_input_tokens ?? 0,
      webSearches: entry.usage.server_tool_use?.web_search_requests ?? 0,
      costPln: pln,
    })
  return pln
}

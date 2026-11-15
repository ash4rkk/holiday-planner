import 'server-only'
import { costUsd, parseBudgetPln, type UsageLike } from '@planer/core'
import { aiUsage, and, getDb, gte, sql } from '@planer/core/db'
import { getRates } from '@planer/core/fx'
import { AI_MODEL } from '@/lib/ai/client'

// Koszt wywołań AI w złotych i limit miesięczny (domyślnie ok. 20 zł). Cennik w @planer/core
// (ai-cost.ts).

const USD_PLN_FALLBACK = 4.2
const DEFAULT_BUDGET_PLN = 20

// Zła wartość w env (np. „20zł”) daje domyślny limit — wcześniej NaN wyłączał limit całkiem.
const rawBudget = process.env.AI_MONTHLY_BUDGET_PLN
export const MONTHLY_BUDGET_PLN = parseBudgetPln(rawBudget, DEFAULT_BUDGET_PLN)
if (rawBudget?.trim() && parseBudgetPln(rawBudget, -1) < 0)
  console.warn(
    `[ai] AI_MONTHLY_BUDGET_PLN="${rawBudget}" to nie kwota — limit ${DEFAULT_BUDGET_PLN} zł`,
  )

/**
 * Najgorszy koszt jednego wywołania (pełne max_tokens) — wywołanie startuje tylko, gdy tyle
 * jeszcze zostało, więc limit nie przekracza się o całe wywołanie.
 */
export const WORST_CASE = {
  /** Jedna runda czatu: historia z kartami, max_tokens 16000, 3 wyszukiwania. */
  chatRound: {
    input_tokens: 30_000,
    output_tokens: 16_000,
    server_tool_use: { web_search_requests: 3 },
  },
  /** Import pliku: zdjęcie albo PDF kilku stron, max_tokens 16000. */
  import: { input_tokens: 30_000, output_tokens: 16_000 },
  /** Nazwa miejsca: krótkie pytanie, max_tokens 1000. */
  place: { input_tokens: 1_000, output_tokens: 1_000 },
} satisfies Record<string, UsageLike>

async function usdPln(): Promise<number> {
  const today = Temporal.Now.plainDateISO('Europe/Warsaw').toString()
  const rates = await getRates([{ currency: 'USD', date: today }], today).catch(() => ({}))
  return (rates as Record<string, number>)[`USD|${today}`] ?? USD_PLN_FALLBACK
}

// Początek miesiąca w Warszawie; przesunięcie strefy zależy od pory roku (zimą +1, latem +2).
const monthStart = () =>
  new Date(
    Temporal.Now.zonedDateTimeISO('Europe/Warsaw').with({ day: 1 }).startOfDay().epochMilliseconds,
  )

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

/** Czy w limicie zmieści się wywołanie o takim najgorszym koszcie. */
export async function budgetAllows(worst: UsageLike, model = AI_MODEL): Promise<boolean> {
  const [left, rate] = await Promise.all([budgetLeftPln(), usdPln()])
  return left > 0 && left >= costUsd(model, worst) * rate
}

export async function recordUsage(entry: {
  /** Brak = wywołanie bez osoby (np. rozwijanie linku w tle). */
  userId: string | null
  kind: 'chat' | 'import' | 'place'
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

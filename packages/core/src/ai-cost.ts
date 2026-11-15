// Koszt wywołań Claude w USD (czyste funkcje — limit miesięczny liczy apps/web/lib/ai/budget.ts).
// Ceny w USD za 1 mln tokenów; zapis do cache to 1,25× ceny wejścia, wyszukiwanie w sieci
// $10 za 1000 zapytań.

type Price = {
  input: number
  output: number
  cacheRead: number
  /** Droższy cennik dla długich promptów (wejście razem z cache powyżej `above` tokenów). */
  long?: { above: number; input: number; output: number; cacheRead: number }
}

const PRICES: Record<string, Price> = {
  'claude-fable-5-2': { input: 8, output: 40, cacheRead: 0.2 },
  'claude-mythos-5-2': { input: 8, output: 40, cacheRead: 0.2 },
  'claude-fable-5-1': { input: 10, output: 50, cacheRead: 1 },
  'claude-mythos-5-1': { input: 10, output: 50, cacheRead: 1 },
  'claude-fable-5': { input: 10, output: 50, cacheRead: 1 },
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2 },
  'claude-opus-5': { input: 5, output: 25, cacheRead: 0.5 },
  'claude-opus-4-8': { input: 5, output: 25, cacheRead: 0.5 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.1 },
  'claude-sonnet-5': { input: 2, output: 10, cacheRead: 0.2 },
  'claude-haiku-5-5': {
    input: 0.1,
    output: 0.5,
    cacheRead: 0.01,
    long: { above: 100_000, input: 0.5, output: 2.5, cacheRead: 0.05 },
  },
}
// Nieznany model (inny w ANTHROPIC_MODEL, nowy zapasowy po odmowie) liczymy po najdroższym
// z cennika: limit raczej za wcześnie niż za późno.
const FALLBACK_PRICE = PRICES['claude-fable-5-1'] as Price
const WEB_SEARCH_USD = 0.01

type Tokens = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens?: number | null
  cache_creation_input_tokens?: number | null
}

export type UsageLike = Tokens & {
  server_tool_use?: { web_search_requests?: number | null } | null
  /**
   * Próby w jednym wywołaniu. Przy modelu zapasowym (`fallbacks`) usage na górze obejmuje tylko
   * próbę, która dała odpowiedź — odmowa w połowie odpowiedzi też kosztuje i jest tylko tutaj.
   */
  iterations?: ReadonlyArray<Tokens & { type: string; model?: string | null }> | null
}

function tokensUsd(model: string, t: Tokens): number {
  const base = PRICES[model] ?? FALLBACK_PRICE
  const cacheRead = t.cache_read_input_tokens ?? 0
  const cacheWrite = t.cache_creation_input_tokens ?? 0
  const prompt = t.input_tokens + cacheRead + cacheWrite
  const p = base.long && prompt > base.long.above ? base.long : base
  return (
    (t.input_tokens * p.input +
      cacheWrite * p.input * 1.25 +
      cacheRead * p.cacheRead +
      t.output_tokens * p.output) /
    1_000_000
  )
}

/**
 * Koszt odpowiedzi w USD. Z `iterations` liczymy każdą próbę po cenie jej modelu i bierzemy
 * więcej z dwóch sum — tak nie zgubimy odrzuconej próby ani nie zaniżymy pętli narzędzi serwera.
 */
export function costUsd(model: string, u: UsageLike): number {
  const searches = (u.server_tool_use?.web_search_requests ?? 0) * WEB_SEARCH_USD
  const top = tokensUsd(model, u)
  const tries = (u.iterations ?? []).filter(
    (i) => i.type === 'message' || i.type === 'fallback_message',
  )
  const perTry = tries.reduce((sum, i) => sum + tokensUsd(i.model || model, i), 0)
  return Math.max(top, perTry) + searches
}

/** Limit miesięczny z env: pusto = domyślny, zła wartość też domyślny (nie wyłącza limitu). */
export function parseBudgetPln(raw: string | undefined, fallback: number): number {
  const text = raw?.trim().replace(',', '.')
  if (!text) return fallback
  const value = Number(text)
  return Number.isFinite(value) && value >= 0 ? value : fallback
}

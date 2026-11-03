import 'server-only'
import Anthropic from '@anthropic-ai/sdk'

// Klient Claude po stronie serwera (klucz nigdy nie trafia do przeglądarki).
// Model domyślny: Claude Opus 5.5; zmiana przez ANTHROPIC_MODEL (np. claude-sonnet-5-5 albo
// claude-haiku-5-5 — dużo taniej). Limit wydatków pilnuje lib/ai/budget.ts.

export const AI_MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-5-5'

/** Gdy model odmówi (klasyfikatory bezpieczeństwa), API samo ponawia na zapasowym modelu. */
export function fallback(): { betas: Anthropic.Beta.AnthropicBeta[]; fallbacks: 'default' } {
  return { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }
}

export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN)
}

let client: Anthropic | undefined
export function anthropic(): Anthropic {
  client ??= new Anthropic({ maxRetries: 2, timeout: 120_000 })
  return client
}

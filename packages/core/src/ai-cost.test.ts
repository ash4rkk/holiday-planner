import { describe, expect, it } from 'vitest'
import { costUsd, parseBudgetPln } from './ai-cost'

const usage = (input: number, output: number) => ({ input_tokens: input, output_tokens: output })

describe('costUsd', () => {
  it('liczy wejście, wyjście, cache i wyszukiwania', () => {
    expect(
      costUsd('claude-opus-5-5', {
        ...usage(1_000_000, 1_000_000),
        cache_read_input_tokens: 1_000_000,
        cache_creation_input_tokens: 1_000_000,
        server_tool_use: { web_search_requests: 3 },
      }),
    ).toBeCloseTo(4 + 20 + 0.2 + 5 + 0.03)
  })

  it('nieznany model po najdroższej cenie', () => {
    expect(costUsd('claude-nowy', usage(1_000_000, 0))).toBe(10)
  })

  it('odmowa w połowie i model zapasowy: obie próby', () => {
    const cost = costUsd('claude-opus-5', {
      ...usage(1_000_000, 0),
      iterations: [
        { type: 'message', model: 'claude-opus-5-5', ...usage(1_000_000, 1_000_000) },
        { type: 'fallback_message', model: 'claude-opus-5', ...usage(1_000_000, 0) },
      ],
    })
    expect(cost).toBeCloseTo(4 + 20 + 5)
  })

  it('próba bez modelu liczy się po modelu odpowiedzi', () => {
    const cost = costUsd('claude-opus-5-5', {
      ...usage(0, 0),
      iterations: [{ type: 'message', model: null, ...usage(1_000_000, 0) }],
    })
    expect(cost).toBe(4)
  })

  it('suma prób nie zaniża usage z góry', () => {
    const cost = costUsd('claude-opus-5-5', {
      ...usage(2_000_000, 0),
      iterations: [{ type: 'message', model: 'claude-opus-5-5', ...usage(1_000_000, 0) }],
    })
    expect(cost).toBe(8)
  })

  it('długi prompt Haiku po wyższej cenie', () => {
    expect(costUsd('claude-haiku-5-5', usage(100_000, 0))).toBeCloseTo(0.01)
    expect(costUsd('claude-haiku-5-5', usage(200_000, 0))).toBeCloseTo(0.1)
  })
})

describe('parseBudgetPln', () => {
  it('liczba, przecinek i zero', () => {
    expect(parseBudgetPln('35', 20)).toBe(35)
    expect(parseBudgetPln('20,5', 20)).toBe(20.5)
    expect(parseBudgetPln('0', 20)).toBe(0)
  })

  it('pusto albo źle = domyślny, nigdy bez limitu', () => {
    expect(parseBudgetPln(undefined, 20)).toBe(20)
    expect(parseBudgetPln('', 20)).toBe(20)
    expect(parseBudgetPln('20zł', 20)).toBe(20)
    expect(parseBudgetPln('-5', 20)).toBe(20)
    expect(parseBudgetPln('Infinity', 20)).toBe(20)
  })
})

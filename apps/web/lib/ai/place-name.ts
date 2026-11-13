import 'server-only'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { z } from 'zod'
import { budgetLeftPln, recordUsage } from '@/lib/ai/budget'
import { AI_MODEL, aiConfigured, anthropic, fallback } from '@/lib/ai/client'
import { memoCache } from '@/lib/memo-cache'

// Mapy Google po polsku udostępniają przetłumaczone nazwy („Baszta Rybacka”, „Zamek Królewski
// w Budapeszcie”), a link nie ma współrzędnych. OpenStreetMap zna nazwy oryginalne
// („Halászbástya”) — AI zamienia jedne na drugie, potem szuka zwykły geokoder.

const INSTRUCTIONS = `Dostajesz nazwę miejsca (często przetłumaczoną na polski) i czasem adres lub miasto. Podaj zapytanie do wyszukiwarki OpenStreetMap: oficjalną nazwę miejsca w języku lokalnym (albo angielską, gdy lokalnej nie znasz), przecinek, miasto w języku lokalnym, np. „Halászbástya, Budapest”. Gdy nie wiesz, o jakie miejsce chodzi, zwróć null — nie zgaduj.`

const Answer = z.object({
  query: z
    .string()
    .nullable()
    .describe('np. „Halászbástya, Budapest”; null, gdy nie wiadomo, o jakie miejsce chodzi'),
})

const cache = memoCache<string | null>(30 * 24 * 60 * 60_000)

/**
 * Oryginalna nazwa miejsca z miastem do geokodowania albo undefined (AI wyłączone, limit
 * wyczerpany, błąd, nieznane miejsce). Wynik w pamięci na 30 dni — to samo miejsce kosztuje raz.
 */
export async function originalPlaceQuery(
  place: { name: string; address?: string; near?: string },
  userId: string | null = null,
): Promise<string | undefined> {
  if (!aiConfigured() || !place.name.trim()) return undefined
  const text = [place.name, place.address, place.near && `okolica: ${place.near}`]
    .filter(Boolean)
    .join('\n')
    .slice(0, 500)
  try {
    const query = await cache(text.toLowerCase(), async () => {
      if ((await budgetLeftPln()) <= 0) throw new Error('limit AI')
      const response = await anthropic().beta.messages.parse(
        {
          model: AI_MODEL,
          max_tokens: 1000,
          ...fallback(),
          output_config: { effort: 'low', format: betaZodOutputFormat(Answer) },
          system: INSTRUCTIONS,
          messages: [{ role: 'user', content: text }],
        },
        { maxRetries: 1, timeout: 20_000 },
      )
      await recordUsage({ userId, kind: 'place', model: response.model, usage: response.usage })
      if (response.stop_reason === 'refusal') return null
      const out = response.parsed_output as z.infer<typeof Answer> | null
      return out?.query?.trim().slice(0, 200) || null
    })
    return query ?? undefined
  } catch (error) {
    console.warn('[ai] nazwa miejsca', String(error))
    return undefined
  }
}

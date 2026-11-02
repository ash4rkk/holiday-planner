import { parseOpenGraph } from '@planer/core'
import { z } from 'zod'
import { fetchPublicHtml } from '@/lib/safe-fetch'

const body = z.object({ url: z.string().url().max(2000) })

/** Podgląd Open Graph dla wklejonego linku. Bez podglądu (błąd, nie-HTML) zwraca sam adres. */
export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'nieprawidłowy adres' }, { status: 400 })
  const page = await fetchPublicHtml(parsed.data.url)
  if (!page) return Response.json({ url: parsed.data.url })
  return Response.json(parseOpenGraph(page.html, page.url))
}

import { z } from 'zod'
import { resolvePlace } from '@/lib/maps-resolve'

const body = z.object({
  title: z.string().max(500).optional(),
  text: z.string().max(4000).optional(),
  url: z.string().max(2000).optional(),
})

/** Rozwija link Google Maps (wklejony albo udostępniony) do nazwy, adresu i współrzędnych. */
export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'nieprawidłowe dane' }, { status: 400 })
  return Response.json(await resolvePlace(parsed.data))
}

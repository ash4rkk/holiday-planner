import { CARD_STATUSES, CARD_TYPES } from '@planer/core'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getCurrentUser } from '@/lib/auth/user'
import { createTemplate } from '@/lib/templates'

const body = z.object({
  name: z.string().trim().min(1).max(60),
  type: z.enum(CARD_TYPES),
  markdown: z.string().max(10_000),
  defaultFields: z
    .object({
      remindMin: z.number().int().positive().max(10_080).optional(),
      durationMin: z.number().int().positive().max(10_080).optional(),
      status: z.enum(CARD_STATUSES).optional(),
    })
    .default({}),
})

/** „Zapisz jako szablon” z karty. */
export async function POST(request: Request) {
  await getCurrentUser()
  const parsed = body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'nieprawidłowy szablon' }, { status: 400 })
  const template = await createTemplate({ ...parsed.data, sortOrder: 100 } as never)
  revalidatePath('/', 'layout')
  return Response.json(template)
}

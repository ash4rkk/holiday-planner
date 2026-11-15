'use server'

import { isIsoDate } from '@planer/core'
import type { LeavePeriod } from '@planer/core/db'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getCurrentUser } from '@/lib/auth/user'
import { insertLeave, isUuid, patchLeave, removeLeave } from '@/lib/leave'

/** Najdłuższy okres: rok (literówka w roku nie robi urlopu na dekadę). */
const MAX_DAYS = 366

const input = z
  .object({
    startDate: z.string().refine(isIsoDate),
    endDate: z.string().refine(isIsoDate),
    note: z.string().max(200).optional(),
  })
  .transform((v) => {
    const [startDate, endDate] =
      v.startDate <= v.endDate ? [v.startDate, v.endDate] : [v.endDate, v.startDate]
    return { startDate, endDate, note: v.note?.trim() || null }
  })
  .refine(
    (v) => (Date.parse(v.endDate) - Date.parse(v.startDate)) / 86_400_000 < MAX_DAYS,
    'okres dłuższy niż rok',
  )

export type LeaveInput = z.input<typeof input>
export type LeaveResult = { ok: true; period: LeavePeriod } | { ok: false; error: string }

const done = (period: LeavePeriod): LeaveResult => {
  revalidatePath('/trips')
  return { ok: true, period }
}

export async function createLeave(value: LeaveInput): Promise<LeaveResult> {
  const user = await getCurrentUser()
  const parsed = input.safeParse(value)
  if (!parsed.success) return { ok: false, error: 'sprawdź daty' }
  return done(await insertLeave({ ...parsed.data, createdBy: user.id }))
}

export async function updateLeave(id: string, value: LeaveInput): Promise<LeaveResult> {
  await getCurrentUser()
  const parsed = input.safeParse(value)
  if (!isUuid(id) || !parsed.success) return { ok: false, error: 'sprawdź daty' }
  const period = await patchLeave(id, parsed.data)
  return period ? done(period) : { ok: false, error: 'tego urlopu już nie ma' }
}

export async function deleteLeave(id: string): Promise<boolean> {
  await getCurrentUser()
  if (!isUuid(id)) return false
  const removed = await removeLeave(id)
  revalidatePath('/trips')
  return Boolean(removed)
}

/** „cofnij” po usunięciu: ten sam okres wraca (z tym samym id). */
export async function restoreLeave(period: LeavePeriod): Promise<LeaveResult> {
  const user = await getCurrentUser()
  const parsed = input.safeParse({ ...period, note: period.note ?? undefined })
  if (!isUuid(period.id) || !parsed.success) return { ok: false, error: 'nie udało się przywrócić' }
  return done(await insertLeave({ id: period.id, ...parsed.data, createdBy: user.id }))
}

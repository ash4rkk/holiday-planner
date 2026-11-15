'use server'

import { isIsoDate } from '@planer/core'
import type { LeavePeriod } from '@planer/core/db'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getCurrentUser } from '@/lib/auth/user'
import { insertLeave, isUuid, patchLeave, removeLeave, swapLeave } from '@/lib/leave'
import { listProfiles } from '@/lib/profiles'

/** Najdłuższy okres: rok (literówka w roku nie robi urlopu na dekadę). */
const MAX_DAYS = 366

const input = z
  .object({
    startDate: z.string().refine(isIsoDate),
    endDate: z.string().refine(isIsoDate),
    note: z.string().max(200).optional(),
    person: z.string().max(40).nullable().optional(),
    approved: z.boolean().optional(),
  })
  .transform((v) => {
    const [startDate, endDate] =
      v.startDate <= v.endDate ? [v.startDate, v.endDate] : [v.endDate, v.startDate]
    return {
      startDate,
      endDate,
      note: v.note?.trim() || null,
      person: v.person ?? null,
      approved: v.approved ?? false,
    }
  })
  .refine(
    (v) => (Date.parse(v.endDate) - Date.parse(v.startDate)) / 86_400_000 < MAX_DAYS,
    'okres dłuższy niż rok',
  )

export type LeaveInput = z.input<typeof input>
export type LeaveResult = { ok: true; period: LeavePeriod } | { ok: false; error: string }

/** Osoba urlopu tylko z listy profili (albo `null` = wspólny). */
function knownPerson(person: string | null | undefined, me: string): boolean {
  return !person || listProfiles(me).some((p) => p.name === person)
}

const done = (period: LeavePeriod): LeaveResult => {
  revalidatePath('/trips')
  return { ok: true, period }
}

export async function createLeave(value: LeaveInput): Promise<LeaveResult> {
  const user = await getCurrentUser()
  const parsed = input.safeParse(value)
  if (!parsed.success) return { ok: false, error: 'sprawdź daty' }
  if (!knownPerson(parsed.data.person, user.name))
    return { ok: false, error: 'nie ma takiej osoby' }
  return done(await insertLeave({ ...parsed.data, createdBy: user.id }))
}

export async function updateLeave(id: string, value: LeaveInput): Promise<LeaveResult> {
  const user = await getCurrentUser()
  const parsed = input.safeParse(value)
  if (!isUuid(id) || !parsed.success) return { ok: false, error: 'sprawdź daty' }
  if (!knownPerson(parsed.data.person, user.name))
    return { ok: false, error: 'nie ma takiej osoby' }
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
  if (parsed.success && !knownPerson(parsed.data.person, user.name))
    return { ok: false, error: 'nie ma takiej osoby' }
  if (!isUuid(period.id) || !parsed.success) return { ok: false, error: 'nie udało się przywrócić' }
  return done(await insertLeave({ id: period.id, ...parsed.data, createdBy: user.id }))
}

const swapInput = z.object({
  remove: z.array(z.string().refine(isUuid)).max(50),
  insert: z
    .array(
      z.object({
        id: z.string().refine(isUuid),
        startDate: z.string().refine(isIsoDate),
        endDate: z.string().refine(isIsoDate),
        note: z.string().max(200).nullable(),
        person: z.string().max(40).nullable(),
        approved: z.boolean().default(false),
      }),
    )
    .max(50),
})

/** Malowanie urlopu (i jego „cofnij”): usuwa okresy i zapisuje nowe naraz. */
export async function swapLeavePeriods(
  value: z.input<typeof swapInput>,
): Promise<LeavePeriod[] | null> {
  const user = await getCurrentUser()
  const parsed = swapInput.safeParse(value)
  if (!parsed.success) return null
  if (parsed.data.insert.some((p) => p.startDate > p.endDate || !knownPerson(p.person, user.name)))
    return null
  const saved = await swapLeave(
    parsed.data.remove,
    parsed.data.insert.map((p) => ({ ...p, createdBy: user.id })),
  )
  revalidatePath('/trips')
  return saved
}

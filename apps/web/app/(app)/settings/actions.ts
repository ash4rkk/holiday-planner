'use server'

import { CARD_TYPES, type CardType } from '@planer/core'
import type { ReminderDefaults } from '@planer/core/reminders'
import { setReminderDefaults } from '@planer/core/settings'
import { revalidatePath } from 'next/cache'
import { getCurrentUser } from '@/lib/auth/user'
import { recomputeAllReminders, revokeFamilyLinkByToken } from '@/lib/settings-data'

/** Najdłuższe wyprzedzenie: tydzień. */
const MAX_MIN = 7 * 24 * 60

export async function saveReminderDefaults(form: FormData) {
  await getCurrentUser()
  const value: ReminderDefaults = {}
  for (const type of CARD_TYPES as readonly CardType[]) {
    const min = Number(form.get(type))
    if (Number.isInteger(min) && min > 0 && min <= MAX_MIN) value[type] = min
  }
  await setReminderDefaults(value)
  await recomputeAllReminders(value)
  revalidatePath('/settings', 'layout')
}

export async function revokeLink(token: string) {
  await getCurrentUser()
  await revokeFamilyLinkByToken(token)
  revalidatePath('/settings', 'layout')
}

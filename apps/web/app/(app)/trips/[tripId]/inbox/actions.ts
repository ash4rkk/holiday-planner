'use server'

import { revalidatePath } from 'next/cache'
import { getCurrentUser } from '@/lib/auth/user'
import { markInboxUsed } from '@/lib/inbox'

/** Miejsce rozdzielone (powstała karta) albo odrzucone — znika ze skrzynki. */
export async function resolveInboxItem(tripId: string, id: string) {
  await getCurrentUser()
  await markInboxUsed(id, tripId)
  revalidatePath(`/trips/${tripId}`, 'layout')
}

'use server'

import { revalidatePath } from 'next/cache'
import { getCurrentUser } from '@/lib/auth/user'
import { createShareLink, revokeShareLinks } from '@/lib/share-links'
import { getTrip } from '@/lib/trips'

export async function createFamilyLink(tripId: string): Promise<string | null> {
  const user = await getCurrentUser()
  if (!(await getTrip(tripId))) return null
  const token = await createShareLink(tripId, user.id)
  revalidatePath(`/trips/${tripId}/settings`)
  return token
}

export async function revokeFamilyLink(tripId: string) {
  await getCurrentUser()
  await revokeShareLinks(tripId)
  revalidatePath(`/trips/${tripId}/settings`)
}

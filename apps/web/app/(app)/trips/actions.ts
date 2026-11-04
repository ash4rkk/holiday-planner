'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/user'
import { parseTripForm, type TripFormState } from '@/lib/trip-form'
import { getTrip, insertTrip, patchTrip } from '@/lib/trips'

export async function createTrip(_prev: TripFormState, form: FormData): Promise<TripFormState> {
  await getCurrentUser()
  const result = parseTripForm(form)
  if (!result.ok) return result.state
  const { title, startDate, endDate, currencies, timezone, travelMode, travelBufferMin } =
    result.data
  const trip = await insertTrip({
    timezone,
    travelMode,
    travelBufferMin,
    title,
    startDate: startDate ?? null,
    endDate: endDate ?? startDate ?? null,
    currencies,
  })
  revalidatePath('/', 'layout')
  redirect(`/trips/${trip.id}/list`)
}

export async function updateTrip(
  tripId: string,
  _prev: TripFormState,
  form: FormData,
): Promise<TripFormState> {
  await getCurrentUser()
  if (!(await getTrip(tripId))) return { errors: { title: 'wyjazd nie istnieje' } }
  const result = parseTripForm(form)
  if (!result.ok) return result.state
  const { title, startDate, endDate, currencies, timezone, travelMode, travelBufferMin } =
    result.data
  await patchTrip(tripId, {
    timezone,
    travelMode,
    travelBufferMin,
    title,
    startDate: startDate ?? null,
    endDate: endDate ?? startDate ?? null,
    currencies,
  })
  revalidatePath('/', 'layout')
  redirect(`/trips/${tripId}/list`)
}

export async function setTripArchived(tripId: string, archived: boolean) {
  await getCurrentUser()
  await patchTrip(tripId, { archived })
  revalidatePath('/', 'layout')
  redirect(archived ? '/trips' : `/trips/${tripId}/list`)
}

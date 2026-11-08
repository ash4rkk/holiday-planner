'use server'

import { daysBetween, isIsoDate } from '@planer/core'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/user'
import { parseTripForm, type TripFormState } from '@/lib/trip-form'
import { getTrip, insertTrip, patchTrip } from '@/lib/trips'

export async function createTrip(_prev: TripFormState, form: FormData): Promise<TripFormState> {
  await getCurrentUser()
  const result = parseTripForm(form)
  if (!result.ok) return result.state
  const { title, startDate, endDate, currencies, country, timezone, travelMode, travelBufferMin } =
    result.data
  const trip = await insertTrip({
    timezone,
    travelMode,
    travelBufferMin,
    title,
    startDate: startDate ?? null,
    endDate: endDate ?? startDate ?? null,
    currencies,
    country,
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
  const { title, startDate, endDate, currencies, country, timezone, travelMode, travelBufferMin } =
    result.data
  await patchTrip(tripId, {
    timezone,
    travelMode,
    travelBufferMin,
    title,
    startDate: startDate ?? null,
    endDate: endDate ?? startDate ?? null,
    currencies,
    country,
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

/** „Dodaj dzień” / upuszczenie na nowy dzień: wyjazd kończy się później (najwyżej o tydzień naraz). */
export async function extendTrip(tripId: string, endDate: string): Promise<boolean> {
  await getCurrentUser()
  const trip = await getTrip(tripId)
  if (!trip?.startDate || !isIsoDate(endDate) || endDate < trip.startDate) return false
  if (trip.endDate && (endDate <= trip.endDate || daysBetween(trip.endDate, endDate) > 7))
    return false
  await patchTrip(tripId, { endDate })
  revalidatePath(`/trips/${tripId}`, 'layout')
  return true
}

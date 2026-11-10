'use client'

import { useParams, useRouter } from 'next/navigation'
import { useEffect } from 'react'

export function RedirectToPacking() {
  const router = useRouter()
  const { tripId } = useParams<{ tripId: string }>()
  useEffect(() => router.replace(`/trips/${tripId}/today?packing=1`), [router, tripId])
  return null
}

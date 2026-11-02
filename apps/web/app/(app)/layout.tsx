import { connection } from 'next/server'
import type { ReactNode } from 'react'
import { BottomNav } from '@/components/nav/bottom-nav'
import { NavVisibility } from '@/components/nav/nav-context'
import { OutboxFlusher } from '@/components/share/outbox-flusher'
import { defaultTrip } from '@/lib/trips'

export default async function AppLayout({ children }: { children: ReactNode }) {
  // Ekrany za logowaniem renderują się na żądanie (dane z bazy, użytkownik z nagłówka).
  await connection()
  const trip = await defaultTrip()
  return (
    <NavVisibility>
      <div className="app px-0.5 pt-1 pb-[100px]">{children}</div>
      <BottomNav fallbackTripId={trip?.id} />
      <OutboxFlusher />
    </NavVisibility>
  )
}

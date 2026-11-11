import { formatDateSpan } from '@planer/core'
import { connection } from 'next/server'
import { type ReactNode, Suspense, ViewTransition } from 'react'
import { DialogHost } from '@/components/confirm-dialog'
import { BottomNav } from '@/components/nav/bottom-nav'
import { OutboxFlusher } from '@/components/share/outbox-flusher'
import { ScreenSkeleton } from '@/components/skeleton'
import { ToastStack } from '@/components/toast-stack'
import { Flag } from '@/components/trips/flag'
import { listTrips } from '@/lib/trips'

/**
 * Menu dolne z wyjazdem domyślnym i listą do przełącznika wyjazdów (flagi renderuje serwer) —
 * jedyna część layoutu, która pyta bazę.
 */
async function NavWithTrip() {
  await connection()
  const { current, upcoming, past } = await listTrips()
  const trips = [...current, ...upcoming, ...past.slice(0, 3)].map((t) => ({
    id: t.id,
    title: t.title,
    sub: formatDateSpan(t.startDate, t.endDate),
    flag: t.country ? <Flag country={t.country} className="h-4 w-6" /> : undefined,
  }))
  return <BottomNav fallbackTripId={trips[0]?.id} trips={trips} />
}

export default function AppLayout({ children }: { children: ReactNode }) {
  // Ekrany za logowaniem renderują się na żądanie (dane z bazy, użytkownik z nagłówka) — pod tą
  // granicą Suspense. Przy przejściach między widokami router trzyma stary widok, aż nowy jest gotowy.
  return (
    <>
      <div className="app px-px pt-1 pb-[100px]">
        {/* Widoki wyjazdu przesuwają się w stronę ruchu (typy z dolnego menu i gestu), reszta przenika. */}
        <ViewTransition
          default={{ 'nav-forward': 'slide-forward', 'nav-back': 'slide-back', default: 'auto' }}
        >
          <Suspense fallback={<ScreenSkeleton />}>{children}</Suspense>
        </ViewTransition>
      </div>
      {/* Menu czyta adres (usePathname), więc musi być pod Suspense; pojawia się razem z treścią. */}
      <Suspense fallback={null}>
        <NavWithTrip />
      </Suspense>
      <OutboxFlusher />
      <ToastStack />
      <DialogHost />
    </>
  )
}

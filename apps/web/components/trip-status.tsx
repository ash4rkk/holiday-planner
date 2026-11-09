'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ProfilePhoto } from '@/components/profile/profile-photo'
import { cx } from '@/components/ui'
import {
  type PresenceUser,
  type SyncStatus,
  usePresence,
  useSyncStatus,
  useTrip,
} from '@/lib/yjs/trip-doc'

// `short` stoi przy kropce, gdy nie jest „na żywo” — podpowiedź (title) na telefonie nie działa.
const STATUS: Record<SyncStatus, { label: string; short?: string; dot: string }> = {
  live: { label: 'na żywo', dot: 'bg-green' },
  connecting: {
    label: 'łączenie…',
    short: 'łączę…',
    dot: 'bg-subtle animate-pulse motion-reduce:animate-none',
  },
  offline: { label: 'offline · zmiany zapisane na telefonie', short: 'offline', dot: 'bg-amber' },
  login: { label: 'sesja wygasła', short: 'zaloguj', dot: 'bg-red' },
}

/** Wysepka w nagłówku wyjazdu i przycisk ustawień aplikacji: Twoje zdjęcie, kto jeszcze jest, stan sync. */
export function TripStatus() {
  const status = useSyncStatus()
  const { user } = useTrip()
  // Twoje drugie urządzenie to też Ty, więc zdjęcie się nie dubluje.
  const others = usePresence<{ user: PresenceUser }>().filter((o) => o.user.name !== user.name)
  const { label, short, dot } = STATUS[status]
  const from = usePathname()

  return (
    <Link
      href={`/settings?from=${encodeURIComponent(from)}`}
      aria-label={`ustawienia aplikacji · ${label}`}
      title={label}
      className="island flex h-11 shrink-0 items-center gap-1 px-2 hover:border-accent"
    >
      <ProfilePhoto name={user.name} className="size-7 overflow-hidden rounded-full text-xs" />
      {others.map(({ clientId, user }) => (
        <span
          key={clientId}
          title={user.name}
          className="size-7 overflow-hidden rounded-full border-2 text-xs"
          style={{ borderColor: user.color, color: user.color }}
        >
          <ProfilePhoto name={user.name} className="size-full" />
        </span>
      ))}
      <span className={cx('size-2.5 shrink-0 rounded-full', dot)} aria-hidden="true" />
      {short && (
        <span className="pr-1 text-xs text-subtle" aria-hidden="true">
          {short}
        </span>
      )}
    </Link>
  )
}

/** Wygasła sesja Cloudflare Access: zmiany są w telefonie, wystarczy przeładować i się zalogować. */
export function SessionBanner() {
  const status = useSyncStatus()
  if (status !== 'login') return null
  return (
    <a
      href={typeof window === 'undefined' ? '/' : window.location.pathname}
      className="island fixed inset-x-1 top-[calc(env(safe-area-inset-top)+56px)] z-(--z-sheet) flex min-h-11 items-center gap-2 border-red px-4 text-sm"
    >
      <span className="text-red">●</span>
      <span className="flex-1">sesja wygasła — zmiany są bezpieczne na telefonie</span>
      <span className="font-bold text-accent">zaloguj ›</span>
    </a>
  )
}

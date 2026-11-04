'use client'

import Link from 'next/link'
import { ProfilePhoto } from '@/components/profile/profile-photo'
import { cx } from '@/components/ui'
import {
  type PresenceUser,
  type SyncStatus,
  usePresence,
  useSyncStatus,
  useTrip,
} from '@/lib/yjs/trip-doc'

const STATUS: Record<SyncStatus, { label: string; dot: string }> = {
  live: { label: 'na żywo', dot: 'bg-green' },
  connecting: { label: 'łączenie…', dot: 'bg-dim' },
  offline: { label: 'offline · zmiany zapisane na telefonie', dot: 'bg-dim' },
  login: { label: 'sesja wygasła', dot: 'bg-red' },
}

/** Wysepka w nagłówku wyjazdu i przycisk ustawień aplikacji: Twoje zdjęcie, kto jeszcze jest, stan sync. */
export function TripStatus() {
  const status = useSyncStatus()
  const { user } = useTrip()
  // Twoje drugie urządzenie to też Ty, więc zdjęcie się nie dubluje.
  const others = usePresence<{ user: PresenceUser }>().filter((o) => o.user.name !== user.name)
  const { label, dot } = STATUS[status]

  return (
    <Link
      href="/settings"
      aria-label="ustawienia aplikacji"
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
      <span className={cx('size-2.5 rounded-full', dot)} aria-hidden="true" />
      <span className="sr-only">{label}</span>
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
      className="island fixed inset-x-1 top-14 z-40 flex min-h-11 items-center gap-2 border-red px-4 text-sm"
    >
      <span className="text-red">●</span>
      <span className="flex-1">sesja wygasła — zmiany są bezpieczne na telefonie</span>
      <span className="font-bold text-accent">zaloguj ›</span>
    </a>
  )
}

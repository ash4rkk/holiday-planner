'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { cx } from '@/components/ui'
import type { Profile } from '@/lib/profiles'
import { ProfilePhoto } from './profile-photo'

const SESSION_KEY = 'planer-profile'
const ZOOM_MS = 650

const chosen = () => {
  try {
    return Boolean(sessionStorage.getItem(SESSION_KEY))
  } catch {
    return false
  }
}

/**
 * Wybór profilu raz na sesję. Kim jesteś, wynika z logowania Access: własny kafelek wchodzi dalej,
 * cudzy jest tylko widoczny. Po wyborze zdjęcie zbliża się na cały ekran jak w portfolio.
 */
export function ProfilePicker({ profiles }: { profiles: Profile[] }) {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [zooming, setZooming] = useState<string | null>(null)

  useEffect(() => {
    if (chosen()) router.replace('/trips')
    else setReady(true)
  }, [router])

  const enter = (name: string) => {
    if (zooming) return
    try {
      sessionStorage.setItem(SESSION_KEY, name)
    } catch {}
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      router.replace('/trips')
      return
    }
    setZooming(name)
    router.prefetch('/trips')
    setTimeout(() => router.replace('/trips'), ZOOM_MS)
  }

  return (
    <main
      className={cx(
        'flex min-h-[calc(100dvh-16px)] flex-col items-center justify-center gap-6 p-4',
        !ready && 'invisible',
      )}
    >
      <h1 className={cx('text-2xl font-bold transition-opacity', zooming && 'opacity-0')}>
        wybierz profil
      </h1>
      <div className="grid w-full max-w-xl grid-cols-2 gap-2">
        {profiles.map(({ name, self }) => (
          <button
            key={name}
            type="button"
            disabled={!self}
            onClick={() => enter(name)}
            className={cx(
              'island group relative aspect-square overflow-hidden transition-[opacity,transform] duration-200',
              self ? 'hover:scale-[1.03] hover:border-accent' : 'opacity-40 grayscale',
              zooming && zooming !== name && 'opacity-0',
            )}
          >
            <ProfilePhoto
              name={name}
              className="absolute inset-0 size-full text-5xl transition-transform duration-300 group-enabled:group-hover:scale-105"
            />
            <span className="absolute inset-x-0 bottom-0 bg-panel/82 px-3 py-2 text-center font-bold backdrop-blur-[14px]">
              {name}
            </span>
          </button>
        ))}
      </div>
      {zooming && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-bg"
          aria-hidden="true"
        >
          <ProfilePhoto
            name={zooming}
            className="profile-zoom size-64 rounded-island text-7xl sm:size-96"
          />
        </div>
      )}
    </main>
  )
}

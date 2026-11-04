'use client'

import { useState } from 'react'
import { cx } from '@/components/ui'

/** Zdjęcie profilu; bez pliku na serwerze — pierwsza litera imienia. */
export function ProfilePhoto({ name, className }: { name: string; className?: string }) {
  const [failed, setFailed] = useState(false)
  if (failed)
    return (
      <span
        aria-hidden="true"
        className={cx('flex items-center justify-center bg-raised font-bold', className)}
      >
        {name.charAt(0).toUpperCase()}
      </span>
    )
  return (
    <img
      src={`/api/profile-photo/${encodeURIComponent(name)}`}
      alt=""
      onError={() => setFailed(true)}
      className={cx('object-cover object-top', className)}
    />
  )
}

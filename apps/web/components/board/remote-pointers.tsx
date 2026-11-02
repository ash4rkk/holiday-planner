'use client'

import { useViewport } from '@xyflow/react'
import { type PresenceUser, usePresence } from '@/lib/yjs/trip-doc'

type State = { user: PresenceUser; pointer?: { x: number; y: number } | null }

/** Kursory drugiej osoby na tablicy, stałej wielkości niezależnie od zoomu. */
export function RemotePointers() {
  const others = usePresence<State>()
  const { x: vx, y: vy, zoom } = useViewport()
  return (
    <div className="pointer-events-none absolute inset-0 z-[5] overflow-hidden" aria-hidden="true">
      {others.map(({ clientId, user, pointer }) =>
        pointer ? (
          <div
            key={clientId}
            className="absolute top-0 left-0 transition-transform duration-75"
            style={{
              transform: `translate(${pointer.x * zoom + vx}px, ${pointer.y * zoom + vy}px)`,
            }}
          >
            <svg width="18" height="20" viewBox="0 0 18 20" className="drop-shadow-none">
              <path
                d="M1 1 L1 16 L5.5 12 L9 19 L11.5 18 L8 11 L14 11 Z"
                fill={user.color}
                stroke="var(--bg)"
                strokeWidth="1.2"
              />
            </svg>
            <span
              className="ml-3 rounded-small px-1.5 py-0.5 text-[11px] font-bold"
              style={{ backgroundColor: user.color, color: 'var(--on-accent)' }}
            >
              {user.name}
            </span>
          </div>
        ) : null,
      )}
    </div>
  )
}

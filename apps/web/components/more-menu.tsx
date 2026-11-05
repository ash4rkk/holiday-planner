'use client'

import { MoreHorizontal } from 'lucide-react'
import { type ReactNode, useState } from 'react'

/** „⋯” na wąskim ekranie: rzadsze akcje paska; na szerszym stoją w pasku, a przycisku nie ma. */
export function MoreMenu({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <div className="hidden sm:contents">{children}</div>
      <div className="relative sm:hidden">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label="więcej"
          className="flex size-11 items-center justify-center text-muted hover:text-accent"
        >
          <MoreHorizontal className="size-5" aria-hidden="true" />
        </button>
        {open && (
          <div className="more-panel island fade-in absolute top-full right-0 z-20 mt-1 flex items-center p-1">
            {children}
          </div>
        )}
      </div>
    </>
  )
}

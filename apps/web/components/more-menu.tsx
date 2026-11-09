'use client'

import { MoreHorizontal } from 'lucide-react'
import { type ReactNode, useRef, useState } from 'react'
import { useDismiss } from '@/lib/use-dismiss'

/** „⋯” na wąskim ekranie: rzadsze akcje paska; na szerszym stoją w pasku, a przycisku nie ma. */
export function MoreMenu({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useDismiss(open, () => setOpen(false), ref)
  return (
    <>
      <div className="hidden sm:contents">{children}</div>
      <div ref={ref} className="relative sm:hidden">
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
          // Wybór akcji zamyka menu (linki i przyciski w środku nie wiedzą o „⋯”).
          <div
            onClick={() => setOpen(false)}
            className="more-panel island fade-in shadow-float absolute top-full right-0 z-(--z-popover) mt-2 flex items-center p-1"
          >
            {children}
          </div>
        )}
      </div>
    </>
  )
}

'use client'

import { Brush, Check } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { NAV_SLOT, NAV_SLOT_READY } from '@/components/nav/bottom-nav'
import { cx } from '@/components/ui'
import { useHideWhenInactive } from '@/lib/use-hide-when-inactive'

/**
 * Pędzel w środku menu dolnego (tam, gdzie w widokach wyjazdu jest „+”): włącza malowanie urlopu.
 * Włączony pokazuje „✓” — dotknięcie kończy malowanie.
 */
export function PaintNavButton({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  const root = useRef<HTMLDivElement>(null)
  useHideWhenInactive(root)
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  // Jak w AddButton: czeka na uwodnione menu, ukryty widok oddaje miejsce.
  useEffect(() => {
    const find = () => {
      const el = document.getElementById(NAV_SLOT)
      setSlot(el?.dataset.ready ? el : null)
    }
    find()
    window.addEventListener(NAV_SLOT_READY, find)
    return () => {
      window.removeEventListener(NAV_SLOT_READY, find)
      setSlot(null)
    }
  }, [])
  if (!slot) return null
  return createPortal(
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={on}
        aria-label={on ? 'zakończ malowanie' : 'maluj urlop'}
        title={on ? 'zakończ malowanie' : 'maluj urlop'}
        className={cx(
          'press flex size-14 items-center justify-center rounded-full bg-accent text-on-accent shadow-float transition-colors hover:bg-accent-hover',
          on && 'ring-4 ring-active',
        )}
      >
        {on ? (
          <Check className="size-7" aria-hidden="true" />
        ) : (
          <Brush className="size-6" aria-hidden="true" />
        )}
      </button>
    </div>,
    slot,
  )
}

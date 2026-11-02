'use client'

import { ClipboardPaste, Plus, SquarePlus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { cx } from '@/components/ui'

/** Duży „+”: nowa karta albo wklejony link (zdjęcie z importem AI dojdzie w etapie 7). */
export function AddButton({
  onNew,
  onPaste,
  hidden,
}: {
  onNew: () => void
  onPaste: () => Promise<void>
  hidden?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])

  const items = [
    { label: 'nowa karta', icon: SquarePlus, run: async () => onNew() },
    { label: 'wklej link', icon: ClipboardPaste, run: onPaste },
  ]

  return (
    <div
      ref={root}
      className={cx(
        'fixed right-3 bottom-[calc(76px+env(safe-area-inset-bottom))] z-30 flex flex-col items-end gap-1',
        'transition-transform duration-200 motion-reduce:transition-none',
        hidden && !open && 'translate-y-[calc(100%+90px)]',
      )}
    >
      {open && (
        <div role="menu" className="island flex min-w-44 flex-col p-1">
          {items.map(({ label, icon: Icon, run }) => (
            <button
              key={label}
              type="button"
              role="menuitem"
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                try {
                  await run()
                } finally {
                  setBusy(false)
                  setOpen(false)
                }
              }}
              className="flex min-h-11 items-center gap-2 rounded-[9px] px-3 text-left text-sm hover:bg-raised"
            >
              <Icon className="size-4 text-muted" aria-hidden="true" />
              {busy && label === 'wklej link' ? 'szukam miejsca…' : label}
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="dodaj"
        aria-expanded={open}
        className="flex size-14 items-center justify-center rounded-island bg-accent text-on-accent transition-transform hover:bg-accent-hover"
      >
        <Plus
          className={cx('size-6 transition-transform', open && 'rotate-45')}
          aria-hidden="true"
        />
      </button>
    </div>
  )
}

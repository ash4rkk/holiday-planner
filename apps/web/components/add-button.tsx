'use client'

import { ChevronLeft, ClipboardPaste, LayoutTemplate, Plus, SquarePlus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { cx } from '@/components/ui'
import type { Template } from '@/lib/card-templates'

/** Duży „+”: nowa karta albo wklejony link (zdjęcie z importem AI dojdzie w etapie 7). */
export function AddButton({
  onNew,
  onPaste,
  onTemplate,
  templates = [],
  hidden,
}: {
  onNew: () => void
  onPaste: () => Promise<void>
  onTemplate?: (t: Template) => void
  templates?: Template[]
  hidden?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [picking, setPicking] = useState(false)
  const [busy, setBusy] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) {
      setPicking(false)
      return
    }
    const close = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])

  const items = picking
    ? [
        { label: 'wróć', icon: ChevronLeft, keepOpen: true, run: async () => setPicking(false) },
        ...templates.map((t) => ({
          label: t.name,
          icon: LayoutTemplate,
          keepOpen: false,
          run: async () => onTemplate?.(t),
        })),
      ]
    : [
        { label: 'nowa karta', icon: SquarePlus, keepOpen: false, run: async () => onNew() },
        ...(onTemplate && templates.length
          ? [
              {
                label: 'z szablonu',
                icon: LayoutTemplate,
                keepOpen: true,
                run: async () => setPicking(true),
              },
            ]
          : []),
        { label: 'wklej link', icon: ClipboardPaste, keepOpen: false, run: onPaste },
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
        <div role="menu" className="island flex max-h-[60vh] min-w-44 flex-col overflow-y-auto p-1">
          {items.map(({ label, icon: Icon, run, keepOpen }) => (
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
                  if (!keepOpen) setOpen(false)
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

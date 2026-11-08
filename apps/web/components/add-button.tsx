'use client'

import { Camera, ChevronLeft, ClipboardPaste, LayoutTemplate, Plus, SquarePlus } from 'lucide-react'
import { type CSSProperties, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { NAV_SLOT } from '@/components/nav/bottom-nav'
import { cx } from '@/components/ui'
import type { Template } from '@/lib/card-templates'
import { useDismiss } from '@/lib/use-dismiss'
import { useHideWhenInactive } from '@/lib/use-hide-when-inactive'

/** „+” w menu dolnym: nowa karta, z szablonu, wklejony link, zdjęcie albo PDF do importu AI. */
export function AddButton({
  onNew,
  onPaste,
  onTemplate,
  templates = [],
  onImport,
}: {
  onNew: () => void
  onPaste: () => Promise<void>
  onTemplate?: (t: Template) => void
  templates?: Template[]
  /** Zdjęcie albo PDF do importu AI (szkic karty). */
  onImport?: (files: File[]) => void
}) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [picking, setPicking] = useState(false)
  const [busy, setBusy] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  useHideWhenInactive(root)
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  // Ukryty widok (router trzyma go w <Activity>) oddaje miejsce w menu — inaczej byłyby dwa „+”.
  useEffect(() => {
    setSlot(document.getElementById(NAV_SLOT))
    return () => {
      setSlot(null)
      setOpen(false)
    }
  }, [])

  useEffect(() => {
    if (!open) {
      setPicking(false)
      return
    }
  }, [open])
  useDismiss(open, () => setOpen(false), root)

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
        ...(onImport
          ? [
              {
                label: 'zdjęcie / PDF (AI)',
                icon: Camera,
                keepOpen: false,
                run: async () => fileInput.current?.click(),
              },
            ]
          : []),
      ]

  if (!slot) return null
  return createPortal(
    <div ref={root} className="relative">
      {open && (
        <div
          key={picking ? 'templates' : 'main'}
          role="menu"
          className="island pop-menu absolute right-0 bottom-[calc(100%+12px)] flex max-h-[60vh] min-w-48 flex-col overflow-y-auto p-1"
        >
          {items.map(({ label, icon: Icon, run, keepOpen }, i) => (
            <button
              key={label}
              style={{ '--i': i } as CSSProperties}
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
              className="flex min-h-11 items-center gap-2 rounded-inner px-3 text-left text-sm hover:bg-raised"
            >
              <Icon className="size-4 text-muted" aria-hidden="true" />
              {busy && label === 'wklej link' ? 'szukam miejsca…' : label}
            </button>
          ))}
        </div>
      )}
      {onImport && (
        <input
          ref={fileInput}
          type="file"
          accept="image/*,application/pdf"
          multiple
          className="hidden"
          aria-label="zdjęcie albo PDF do importu"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? [])
            if (files.length) onImport(files)
            e.target.value = ''
          }}
        />
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="dodaj"
        aria-expanded={open}
        className="flex size-11 items-center justify-center rounded-inner bg-accent text-on-accent transition-colors hover:bg-accent-hover"
      >
        <Plus
          className={cx('size-6 transition-transform duration-200', open && 'rotate-45')}
          aria-hidden="true"
        />
      </button>
    </div>,
    slot,
  )
}

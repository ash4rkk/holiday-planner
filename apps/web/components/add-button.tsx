'use client'

import {
  Camera,
  ChevronLeft,
  ClipboardPaste,
  LayoutTemplate,
  type LucideIcon,
  Luggage,
  Plus,
  SquarePlus,
  X,
} from 'lucide-react'
import { type CSSProperties, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { NAV_SLOT, NAV_SLOT_READY } from '@/components/nav/bottom-nav'
import { cx } from '@/components/ui'
import type { Template } from '@/lib/card-templates'
import { useDismiss } from '@/lib/use-dismiss'
import { useHideWhenInactive } from '@/lib/use-hide-when-inactive'
import { usePacking } from '@/lib/yjs/trip-doc'

type Item = {
  label: string
  hint?: string
  icon: LucideIcon
  keepOpen?: boolean
  run: () => Promise<void> | void
}

// Półokrąg nad środkiem menu dolnego: wewnętrzny łuk (karty z lewej, rzeczy z zewnątrz z prawej)
// i szczyt zewnętrznego łuku (lista pakowania). Promienie dobrane pod telefon 360–430 px.
const INNER_R = 132
const OUTER_R = 250
/** Środek półokręgu nad dolną krawędzią ekranu (nad menu dolnym). */
const HUB_BOTTOM = 118

/**
 * „+” w menu dolnym: menu kołowe z grupami — karta (nowa, z szablonu), z zewnątrz (wklejony
 * link, zdjęcie albo PDF do importu AI) i lista pakowania (na Tablicy stawia widżet).
 */
export function AddButton({
  onNew,
  onPaste,
  onTemplate,
  templates = [],
  onImport,
  onPacking,
  packingPlaced,
}: {
  onNew: () => void
  onPaste: () => Promise<void>
  onTemplate?: (t: Template) => void
  templates?: Template[]
  /** Zdjęcie albo PDF do importu AI (szkic karty). */
  onImport?: (files: File[]) => void
  /** Lista pakowania: na Tablicy stawia widżet, gdzie indziej otwiera listę. */
  onPacking?: () => void
  /** Tablica: czy widżet listy już stoi (wtedy „+” go tylko pokazuje). */
  packingPlaced?: boolean
}) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [picking, setPicking] = useState(false)
  const [busy, setBusy] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const overlay = useRef<HTMLDivElement>(null)
  const plus = useRef<HTMLButtonElement>(null)
  const [plusAt, setPlusAt] = useState<DOMRect | null>(null)
  const packing = usePacking()
  useHideWhenInactive(root)
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  // Ukryty widok (router trzyma go w <Activity>) oddaje miejsce w menu — inaczej byłyby dwa „+”.
  // Czeka na uwodnione menu (NAV_SLOT_READY) — wcześniej wstawiony „+” psuje hydratację menu.
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
      setOpen(false)
    }
  }, [])

  useEffect(() => {
    if (!open) setPicking(false)
  }, [open])
  // Menu leży w portalu nad menu dolnym, więc „poza” liczy się względem niego.
  useDismiss(open, () => setOpen(false), overlay)

  const toggle = () => {
    setPlusAt(plus.current?.getBoundingClientRect() ?? null)
    setOpen((v) => !v)
  }

  const run = async (item: Item) => {
    setBusy(true)
    try {
      await item.run()
    } finally {
      setBusy(false)
      if (!item.keepOpen) setOpen(false)
    }
  }

  const card: Item[] = [
    { label: 'nowa karta', icon: SquarePlus, run: onNew },
    ...(onTemplate && templates.length
      ? [{ label: 'z szablonu', icon: LayoutTemplate, keepOpen: true, run: () => setPicking(true) }]
      : []),
  ]
  const outside: Item[] = [
    {
      label: busy ? 'szukam miejsca…' : 'wklej link',
      hint: 'Mapy Google',
      icon: ClipboardPaste,
      run: onPaste,
    },
    ...(onImport
      ? [
          {
            label: 'zdjęcie / PDF',
            hint: 'AI',
            icon: Camera,
            run: () => fileInput.current?.click(),
          },
        ]
      : []),
  ]
  const packed = packing.filter((i) => i.packed).length
  const top: Item | null = onPacking
    ? {
        label: 'lista pakowania',
        hint: [
          packing.length ? `${packed}/${packing.length}` : 'pusta',
          packingPlaced && 'na tablicy',
        ]
          .filter(Boolean)
          .join(' · '),
        icon: Luggage,
        run: onPacking,
      }
    : null
  const inner = [...card, ...outside]

  if (!slot) return null
  return (
    <>
      {createPortal(
        <div ref={root} className="relative">
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
            ref={plus}
            type="button"
            onClick={toggle}
            aria-label="dodaj"
            aria-expanded={open}
            className="flex size-14 items-center justify-center rounded-full bg-accent text-on-accent shadow-float transition-colors hover:bg-accent-hover"
          >
            <Plus
              className={cx('size-7 transition-transform duration-200', open && 'rotate-45')}
              aria-hidden="true"
            />
          </button>
        </div>,
        slot,
      )}
      {open &&
        createPortal(
          <div
            ref={overlay}
            role="menu"
            aria-label="dodaj"
            className="fixed inset-0 z-(--z-drawer)"
          >
            <button
              type="button"
              aria-label="zamknij"
              tabIndex={-1}
              onClick={() => setOpen(false)}
              className="fade-in absolute inset-0 bg-bg/70 backdrop-blur-[2px]"
            />
            {picking ? (
              <Templates
                templates={templates}
                onBack={() => setPicking(false)}
                onPick={(t) => {
                  setOpen(false)
                  onTemplate?.(t)
                }}
              />
            ) : (
              <Radial
                inner={inner}
                split={card.length}
                top={top}
                // Na Tablicy lista staje jako widżet; w innych widokach „+” tylko ją otwiera.
                topCaption={packingPlaced === undefined ? 'pakowanie' : 'na tablicę'}
                onRun={run}
                disabled={busy}
              />
            )}
            {/* ✕ dokładnie w miejscu „+”: menu dolne leży pod nakładką. */}
            {plusAt && (
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="zamknij menu"
                className="fixed flex items-center justify-center rounded-full bg-accent text-on-accent"
                style={{
                  left: plusAt.left,
                  top: plusAt.top,
                  width: plusAt.width,
                  height: plusAt.height,
                }}
              >
                <X className="size-7" aria-hidden="true" />
              </button>
            )}
          </div>,
          document.body,
        )}
    </>
  )
}

function Radial({
  inner,
  split,
  top,
  topCaption,
  onRun,
  disabled,
}: {
  inner: Item[]
  /** Ile pierwszych pozycji łuku to karty (reszta: z zewnątrz) — dla podpisów grup. */
  split: number
  top: Item | null
  topCaption: string
  onRun: (item: Item) => void
  disabled: boolean
}) {
  const hubBottom = `calc(${HUB_BOTTOM}px + env(safe-area-inset-bottom))`
  // Od lewej (180°) przez górę do prawej (360°); jedna pozycja stoi na szczycie.
  const angle = (i: number) => (inner.length === 1 ? 270 : 180 + (i * 180) / (inner.length - 1))
  const at = (r: number, deg: number): CSSProperties => {
    const a = (deg * Math.PI) / 180
    return {
      left: `calc(50% + ${r * Math.cos(a)}px)`,
      bottom: `calc(${hubBottom} + ${-r * Math.sin(a)}px)`,
    }
  }
  return (
    <>
      <svg
        className="fade-in pointer-events-none absolute overflow-visible"
        style={{ left: '50%', bottom: hubBottom }}
        width={1}
        height={1}
        aria-hidden="true"
      >
        {[INNER_R, ...(top ? [OUTER_R] : [])].map((r) => (
          <path
            key={r}
            d={`M ${-r} 1 A ${r} ${r} 0 0 1 ${r} 1`}
            fill="none"
            strokeDasharray="3 6"
            className="stroke-sel"
          />
        ))}
      </svg>
      {split > 0 && split < inner.length && (
        <>
          <Caption style={{ left: 'calc(50% - 78px)', bottom: `calc(${hubBottom} + 50px)` }}>
            karta
          </Caption>
          <Caption style={{ left: 'calc(50% + 78px)', bottom: `calc(${hubBottom} + 50px)` }}>
            z zewnątrz
          </Caption>
        </>
      )}
      {top && (
        <Caption style={{ left: '50%', bottom: `calc(${hubBottom} + ${OUTER_R + 66}px)` }}>
          {topCaption}
        </Caption>
      )}
      {inner.map((item, i) => (
        <RadialItem
          key={item.label}
          item={item}
          index={i}
          style={at(INNER_R, angle(i))}
          onRun={onRun}
          disabled={disabled}
        />
      ))}
      {top && (
        <RadialItem
          item={top}
          index={inner.length}
          style={at(OUTER_R, 270)}
          onRun={onRun}
          disabled={disabled}
          big
        />
      )}
    </>
  )
}

function Caption({ style, children }: { style: CSSProperties; children: string }) {
  return (
    <span
      className="fade-in pointer-events-none absolute -translate-x-1/2 text-2xs text-subtle italic"
      style={style}
    >
      {children}
    </span>
  )
}

function RadialItem({
  item,
  index,
  style,
  onRun,
  disabled,
  big,
}: {
  item: Item
  index: number
  style: CSSProperties
  onRun: (item: Item) => void
  disabled: boolean
  big?: boolean
}) {
  const Icon = item.icon
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={() => onRun(item)}
      className="pop-radial absolute flex w-24 -translate-x-1/2 translate-y-[28px] flex-col items-center gap-1"
      style={{ ...style, '--i': index } as CSSProperties}
    >
      <span
        className={cx(
          'island shadow-float flex items-center justify-center rounded-full transition-colors',
          big ? 'size-16 bg-active text-accent' : 'size-14 text-text hover:text-accent',
        )}
      >
        <Icon className={big ? 'size-7' : 'size-6'} aria-hidden="true" />
      </span>
      <span className="text-center text-xs leading-tight font-bold">{item.label}</span>
      {item.hint && <span className="-mt-1 text-2xs text-subtle">{item.hint}</span>}
    </button>
  )
}

/** „z szablonu”: lista szablonów nad „+”, z powrotem do menu kołowego. */
function Templates({
  templates,
  onBack,
  onPick,
}: {
  templates: Template[]
  onBack: () => void
  onPick: (t: Template) => void
}) {
  return (
    <div className="island pop-menu shadow-float absolute right-2 bottom-[calc(76px+env(safe-area-inset-bottom))] flex max-h-[60vh] min-w-56 flex-col overflow-y-auto p-1">
      <button
        type="button"
        onClick={onBack}
        className="flex min-h-11 items-center gap-2 rounded-inner px-3 text-left text-sm text-muted hover:bg-raised"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
        wróć
      </button>
      {templates.map((t, i) => (
        <button
          key={t.id}
          type="button"
          role="menuitem"
          style={{ '--i': i + 1 } as CSSProperties}
          onClick={() => onPick(t)}
          className="flex min-h-11 items-center gap-2 rounded-inner px-3 text-left text-sm hover:bg-raised"
        >
          <LayoutTemplate className="size-4 text-muted" aria-hidden="true" />
          {t.name}
        </button>
      ))}
    </div>
  )
}

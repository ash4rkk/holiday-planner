'use client'

import { type CardSnapshot, formatDayHeader } from '@planer/core'
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Lightbulb,
  Pin,
  PinOff,
  SkipForward,
  Trash2,
  Undo2,
} from 'lucide-react'
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cx } from '@/components/ui'

export type CardMenuActions = {
  togglePin: () => void
  moveToDay: (date: string) => void
  toIdeas: () => void
  toggleSkip: () => void
  trash: () => void
}

const MARGIN = 8

function Item({
  icon,
  label,
  onClick,
  danger,
  after,
}: {
  icon: ReactNode
  label: string
  onClick: () => void
  danger?: boolean
  after?: ReactNode
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cx(
        'flex min-h-11 w-full items-center gap-3 rounded-small px-3 text-left text-sm hover:bg-raised',
        danger ? 'text-red' : 'text-text',
      )}
    >
      <span className={cx('flex size-5 items-center justify-center', !danger && 'text-muted')}>
        {icon}
      </span>
      <span className="flex-1">{label}</span>
      {after}
    </button>
  )
}

/**
 * Menu karty na Tablicy (prawy klik, przytrzymanie palcem): przypnij, zmień dzień, do pomysłów,
 * pomiń, do kosza. Na telefonie od dołu, na komputerze przy kursorze.
 */
export function CardMenu({
  card,
  at,
  days,
  wide,
  actions,
  onClose,
}: {
  card: CardSnapshot
  at: { x: number; y: number }
  days: string[]
  wide: boolean
  actions: CardMenuActions
  onClose: () => void
}) {
  const [view, setView] = useState<'main' | 'days'>('main')
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number }>()

  // Przy kursorze, ale w całości na ekranie.
  useLayoutEffect(() => {
    if (!wide) return
    const box = ref.current?.getBoundingClientRect()
    if (!box) return
    setPos({
      left: Math.min(at.x, window.innerWidth - box.width - MARGIN),
      top: Math.min(at.y, window.innerHeight - box.height - MARGIN),
    })
  }, [wide, at, view])

  useEffect(() => {
    const escape = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', escape)
    return () => document.removeEventListener('keydown', escape)
  }, [onClose])

  const run = (fn: () => void) => () => {
    fn()
    onClose()
  }

  const content =
    view === 'main' ? (
      <>
        <p className="truncate px-3 pt-2 pb-1 text-xs text-subtle">{card.title || 'bez tytułu'}</p>
        <Item
          icon={card.pinned ? <PinOff className="size-5" /> : <Pin className="size-5" />}
          label={card.pinned ? 'odepnij' : 'przypnij'}
          onClick={run(actions.togglePin)}
        />
        <Item
          icon={<CalendarDays className="size-5" />}
          label="zmień dzień"
          onClick={() => setView('days')}
          after={<ChevronRight className="size-4 text-muted" aria-hidden="true" />}
        />
        <Item
          icon={<Lightbulb className="size-5" />}
          label="do pomysłów"
          onClick={run(actions.toIdeas)}
        />
        <Item
          icon={card.skipped ? <Undo2 className="size-5" /> : <SkipForward className="size-5" />}
          label={card.skipped ? 'nie pomijaj' : 'pomiń'}
          onClick={run(actions.toggleSkip)}
        />
        <Item
          icon={<Trash2 className="size-5" />}
          label="do kosza"
          onClick={run(actions.trash)}
          danger
        />
      </>
    ) : (
      <>
        <button
          type="button"
          onClick={() => setView('main')}
          className="flex min-h-11 w-full items-center gap-2 px-3 text-sm text-muted hover:text-accent"
        >
          <ChevronLeft className="size-4" aria-hidden="true" /> zmień dzień
        </button>
        <div className="flex max-h-[50dvh] flex-col overflow-y-auto">
          {days.map((date) => (
            <button
              key={date}
              type="button"
              role="menuitem"
              disabled={date === card.date}
              onClick={run(() => actions.moveToDay(date))}
              className="flex min-h-11 items-center rounded-small px-3 text-left text-sm hover:bg-raised disabled:text-accent"
            >
              {formatDayHeader(date)}
              {date === card.date && ' · obecny'}
            </button>
          ))}
        </div>
      </>
    )

  return createPortal(
    <div className="fixed inset-0 z-(--z-dialog)" onContextMenu={(e) => e.preventDefault()}>
      {/* Zamyka nowe dotknięcie, nie „klik” z puszczenia palca, który właśnie otworzył menu. */}
      <button
        type="button"
        aria-label="zamknij menu"
        onPointerDown={onClose}
        onKeyDown={(e) => e.key === 'Enter' && onClose()}
        className={cx('absolute inset-0 cursor-default', !wide && 'fade-in bg-bg/60')}
      />
      <div
        ref={ref}
        role="menu"
        aria-label={`menu karty ${card.title}`}
        className={cx(
          'island shadow-float absolute flex flex-col p-1',
          wide
            ? cx('w-60 fade-in', !pos && 'invisible')
            : 'sheet-in inset-x-px bottom-px pb-[max(4px,env(safe-area-inset-bottom))]',
        )}
        style={wide ? { left: pos?.left ?? at.x, top: pos?.top ?? at.y } : undefined}
      >
        {content}
      </div>
    </div>,
    document.body,
  )
}

'use client'

import { ChevronDown, ChevronRight } from 'lucide-react'
import { type PointerEvent, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useKeyboardInset } from '@/components/card/format-toolbar'
import { cx } from '@/components/ui'
import { useHideWhenInactive } from '@/lib/use-hide-when-inactive'
import { closePacking, usePackingOpen } from '@/lib/use-packing-drawer'
import { useWide } from '@/lib/use-wide'
import { PackingList } from './packing-list'

const PANEL_WIDTH = 400
const CLOSE_MS = 190
/** Tyle trzeba pociągnąć w dół, żeby schować drawer (jak arkusz karty). */
const DRAG_CLOSE_PX = 110

/**
 * Lista pakowania nad każdym widokiem wyjazdu (`?packing`): na telefonie arkusz z dołu, na
 * szerokim ekranie panel z prawej. Zamknięcie zostawia widok, z którego ją otwarto.
 */
export function PackingDrawer({ people }: { people: string[] }) {
  const open = usePackingOpen()
  const ref = useRef<HTMLDivElement>(null)
  // Wyjazd w ukrytym widoku (<Activity>) nie może zostawić drawera na wierzchu.
  useHideWhenInactive(ref)
  // Portal do body: wrapper widoku tworzy kontekst warstw, w którym drawer przegrywa z dolnym menu.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return null
  return createPortal(<div ref={ref}>{open && <Drawer people={people} />}</div>, document.body)
}

function Drawer({ people }: { people: string[] }) {
  const wide = useWide()
  const keyboard = useKeyboardInset()
  const [closing, setClosing] = useState(false)
  const [dragY, setDragY] = useState(0)
  const dragFrom = useRef<number | null>(null)
  const pulled = useRef(0)

  const dismissRef = useRef(() => {})
  const dismiss = () => {
    if (closing) return
    setClosing(true)
    setTimeout(closePacking, CLOSE_MS)
  }
  dismissRef.current = dismiss

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && dismissRef.current()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Bez przewijania strony pod arkuszem; obok panelu widok dalej się przewija.
  useEffect(() => {
    if (wide) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [wide])

  const grip = {
    onPointerDown: (e: PointerEvent) => {
      dragFrom.current = e.clientY
      pulled.current = 0
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    onPointerMove: (e: PointerEvent) => {
      if (dragFrom.current === null) return
      pulled.current = e.clientY - dragFrom.current
      setDragY(Math.max(0, pulled.current))
    },
    onPointerUp: () => {
      dragFrom.current = null
      setDragY(0)
      if (pulled.current > DRAG_CLOSE_PX) dismiss()
    },
  }

  const Close = wide ? ChevronRight : ChevronDown

  return (
    <>
      {!wide && (
        <button
          type="button"
          aria-label="zamknij listę pakowania"
          onClick={dismiss}
          className="fade-in fixed inset-0 z-(--z-sheet) bg-bg/50"
        />
      )}
      <div
        role="dialog"
        aria-modal={!wide}
        aria-label="lista pakowania"
        className={cx(
          'fixed z-(--z-sheet) flex flex-col bg-bg',
          wide
            ? cx('inset-y-0 right-0 border-l border-line', closing ? 'panel-out' : 'panel-in')
            : cx(
                'inset-x-0 bottom-0 rounded-t-island border-t border-line',
                // Przy klawiaturze arkusz kończy się nad nią (pasek kategorii i osób tuż nad klawiszami).
                !keyboard && 'h-[85dvh]',
                closing ? 'sheet-out' : 'sheet-in',
              ),
          dragFrom.current === null && dragY > 0 && 'transition-transform duration-200',
        )}
        style={{
          ...(wide && { width: PANEL_WIDTH }),
          ...(!wide &&
            keyboard > 0 && { bottom: keyboard, height: `calc(100dvh - ${keyboard}px)` }),
          ...(dragY > 0 && { transform: `translateY(${dragY}px)` }),
        }}
      >
        {!wide && (
          <div
            {...grip}
            aria-hidden="true"
            className="flex h-6 shrink-0 touch-none items-center justify-center"
          >
            <span className="h-1 w-10 rounded-full bg-line" />
          </div>
        )}
        <div className="flex shrink-0 items-center gap-2 p-1">
          <button
            type="button"
            onClick={dismiss}
            aria-label="zamknij listę pakowania"
            className="island flex size-11 items-center justify-center text-muted hover:text-accent"
          >
            <Close className="size-5" aria-hidden="true" />
          </button>
          <h2 className="font-bold">lista pakowania</h2>
        </div>
        <PackingList people={people} />
      </div>
    </>
  )
}

'use client'

import { ChevronDown, ChevronRight } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useKeyboardInset } from '@/components/card/format-toolbar'
import { cx } from '@/components/ui'
import { useHideWhenInactive } from '@/lib/use-hide-when-inactive'
import { closePacking, usePackingOpen } from '@/lib/use-packing-drawer'
import { useSheet } from '@/lib/use-sheet'
import { useWide } from '@/lib/use-wide'
import { PackingList } from './packing-list'

const PANEL_WIDTH = 400

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
  const { closing, dismiss, sheet, backdrop, grip } = useSheet({
    enabled: !wide,
    onClose: closePacking,
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && dismiss()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dismiss])

  // Bez przewijania strony pod arkuszem; obok panelu widok dalej się przewija.
  useEffect(() => {
    if (wide) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [wide])

  const Close = wide ? ChevronRight : ChevronDown

  return (
    <>
      {!wide && (
        <button
          ref={backdrop}
          type="button"
          tabIndex={-1}
          aria-label="zamknij listę pakowania"
          onClick={dismiss}
          className="fixed inset-0 z-(--z-sheet) bg-bg/50"
        />
      )}
      <div
        ref={sheet}
        role="dialog"
        aria-modal={!wide}
        aria-label="lista pakowania"
        className={cx(
          'fixed z-(--z-sheet) flex flex-col bg-bg',
          wide
            ? cx('inset-y-0 right-0 border-l border-line', closing ? 'panel-out' : 'panel-in')
            : cx(
                'inset-x-0 bottom-0 rounded-t-island border-t border-line after:absolute after:inset-x-0 after:top-full after:h-24 after:bg-bg',
                // Przy klawiaturze arkusz kończy się nad nią (pasek kategorii i osób tuż nad klawiszami).
                !keyboard && 'h-[85dvh]',
              ),
        )}
        style={{
          ...(wide && { width: PANEL_WIDTH }),
          ...(!wide &&
            keyboard > 0 && { bottom: keyboard, height: `calc(100dvh - ${keyboard}px)` }),
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
        <div
          {...grip}
          className={cx('flex shrink-0 items-center gap-2 p-1', !wide && 'touch-none')}
        >
          <button
            type="button"
            onClick={dismiss}
            aria-label="zamknij listę pakowania"
            className="press island flex size-11 items-center justify-center text-muted hover:text-accent"
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

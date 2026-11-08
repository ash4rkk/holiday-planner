'use client'

import { type CardSnapshot, chooseVariant } from '@planer/core'
import { type PointerEvent, type ReactNode, useRef, useState } from 'react'
import { cx } from '@/components/ui'
import { useTrip } from '@/lib/yjs/trip-doc'

// Powyżej progu przeciągania karta nie dostaje już ruchu, więc jej przytrzymanie musi odpaść wcześniej.
const DRAG_PX = 10

/**
 * Karta z wariantami na osi dnia: karuzela z brzegiem następnej opcji, przesuwana palcem i myszą.
 * Opcje mają równą wysokość, a wybór leży w karcie. Kolumna godzin idzie za widoczną opcją.
 * Bottom-nav nie łapie tu gestu zmiany ekranu, bo pomija elementy `.overflow-x-auto`.
 */
export function VariantCarousel({
  main,
  variants,
  time,
  tile,
}: {
  main: CardSnapshot
  variants: CardSnapshot[]
  time: (card: CardSnapshot) => ReactNode
  tile: (card: CardSnapshot) => ReactNode
}) {
  const { doc } = useTrip()
  const track = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null)
  const dragged = useRef(false)
  const [active, setActive] = useState(0)
  const options = [main, ...variants]

  const offsets = () => {
    const slides = [...(track.current?.children ?? [])] as HTMLElement[]
    return slides.map((s) => s.offsetLeft - (slides[0]?.offsetLeft ?? 0))
  }
  const nearest = () => {
    const left = track.current?.scrollLeft ?? 0
    const all = offsets().map((o) => Math.abs(o - left))
    return all.indexOf(Math.min(...all))
  }
  const go = (i: number) => track.current?.scrollTo({ left: offsets()[i] ?? 0, behavior: 'smooth' })

  // Palec przesuwa natywnie; mysz trzeba poprowadzić samemu, bez zatrzaskiwania w trakcie ruchu.
  const mouse = {
    onPointerDown: (e: PointerEvent<HTMLDivElement>) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return
      drag.current = { x: e.clientX, left: e.currentTarget.scrollLeft, moved: false }
    },
    onPointerMove: (e: PointerEvent<HTMLDivElement>) => {
      const d = drag.current
      if (!d) return
      const dx = e.clientX - d.x
      if (!d.moved && Math.abs(dx) < DRAG_PX) return
      if (!d.moved) {
        d.moved = true
        e.currentTarget.setPointerCapture(e.pointerId)
        e.currentTarget.style.scrollSnapType = 'none'
      }
      e.currentTarget.scrollLeft = d.left - dx
    },
    onPointerUp: (e: PointerEvent<HTMLDivElement>) => {
      const moved = drag.current?.moved
      drag.current = null
      if (!moved) return
      dragged.current = true
      const target = e.currentTarget
      go(nearest())
      setTimeout(() => {
        target.style.scrollSnapType = ''
      }, 350)
    },
  }

  return (
    <div className="flex gap-1">
      {time(options[active] ?? main)}
      <div
        ref={track}
        {...mouse}
        onPointerCancel={mouse.onPointerUp}
        onScroll={() => setActive(nearest())}
        onClickCapture={(e) => {
          // Koniec przeciągania to nie tap w kartę.
          if (!dragged.current) return
          dragged.current = false
          e.preventDefault()
          e.stopPropagation()
        }}
        className="flex min-w-0 flex-1 cursor-grab snap-x snap-mandatory gap-1 overflow-x-auto select-none active:cursor-grabbing [scrollbar-width:none]"
      >
        {options.map((c, i) => (
          <div
            key={c.id}
            className={cx(
              'relative w-[88%] shrink-0 snap-start transition-opacity [&>button:first-child]:h-full [&>button:first-child]:pb-9',
              main.variantChosen && i > 0 && 'opacity-55',
            )}
          >
            {tile(c)}
            {(!main.variantChosen || i > 0) && (
              <button
                type="button"
                onClick={() => chooseVariant(doc, c.id)}
                className="hit absolute right-1 bottom-1 min-h-9 rounded-small px-2 text-xs font-bold text-accent"
              >
                wybierz
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

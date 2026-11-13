'use client'

import { CARD_STATUS_LABELS, type CardSnapshot, shiftClock, spanMin } from '@planer/core'
import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AmountBadge } from '@/components/amounts'
import { StatusMark } from '@/components/card/status-mark'
import { TYPE_STYLE } from '@/components/card/type-style'
import { cx } from '@/components/ui'

const minutesOf = (hhmm: string) => {
  const [h = 0, m = 0] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/** Karta bez długości zajmuje na osi godzinę. */
const DEFAULT_MIN = 60

/**
 * Dzień jako pozioma oś godzin: miejsca z godziną to bloki w kolorach typów, kreska „teraz”.
 * Oś zaczyna się o 8:00 albo wcześniej, jeśli dzień zaczyna się wcześniej; kończy o północy.
 * Noclegi pomijamy — trwają całą noc i zasłoniłyby resztę.
 *
 * Dotknięcie bloku pokazuje pod osią podgląd karty; na telefonie dotknięcie zaznaczonego bloku
 * otwiera kartę (jak na Tablicy). Na komputerze podgląd po najechaniu, a kliknięcie nic nie otwiera.
 * Podgląd to dymek nad stroną (portal do `body`), więc nie rozpycha karty dnia i może z niej
 * wystawać. `legText` podpowiada dojazd do miejsca, np. „17 min pieszo · wyjdź do 20:03”.
 */
export function DayAxis({
  cards,
  now,
  onOpen,
  legText,
}: {
  cards: CardSnapshot[]
  now?: string
  onOpen: (id: string) => void
  legText?: (id: string) => string | undefined
}) {
  const timed = cards.filter((c) => c.time && c.type !== 'stay' && !c.skipped)
  const [selectedId, setSelectedId] = useState<string>()
  const axisRef = useRef<HTMLDivElement>(null)
  const index = timed.findIndex((c) => c.id === selectedId)
  const selected = timed[index]

  const firstHour = Math.min(8, ...timed.map((c) => Math.floor(minutesOf(c.time as string) / 60)))
  const from = firstHour * 60
  const span = 24 * 60 - from
  const share = (min: number) => Math.max(0, Math.min(100, ((min - from) / span) * 100))
  const hours = Array.from({ length: 5 }, (_, i) =>
    Math.round(firstHour + ((24 - firstHour) * i) / 4),
  )
  const range = (c: CardSnapshot) => {
    const start = minutesOf(c.time as string)
    return { start, end: Math.min(24 * 60, start + (spanMin(c) ?? DEFAULT_MIN)) }
  }

  return (
    <div ref={axisRef}>
      {/* Dotknięcie tła osi chowa podgląd. */}
      <div
        className="relative h-9 rounded-small bg-raised"
        onClick={() => setSelectedId(undefined)}
      >
        {timed.map((c) => {
          const { start, end } = range(c)
          const past = now !== undefined && minutesOf(now) >= end
          const isSelected = c.id === selectedId
          return (
            <button
              key={c.id}
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                // Na komputerze kliknięcie tylko pokazuje podgląd; kartę otwiera „otwórz kartę”.
                if (isSelected && !window.matchMedia('(hover: hover)').matches) onOpen(c.id)
                else setSelectedId(c.id)
              }}
              onMouseEnter={(e) => {
                // Na komputerze podgląd po najechaniu; dotyk wysyła mouseenter tuż przed click.
                if (window.matchMedia('(hover: hover)').matches) setSelectedId(c.id)
                else e.preventDefault()
              }}
              title={`${c.time} ${c.title}`}
              aria-label={`${c.time} ${c.title || 'bez tytułu'}`}
              aria-pressed={isSelected}
              className={cx(
                'absolute inset-y-1.5 min-w-1.5 rounded-[3px] transition-opacity hover:opacity-100',
                TYPE_STYLE[c.type].bar,
                isSelected
                  ? 'opacity-100 outline-2 outline-offset-1 outline-text'
                  : past
                    ? 'opacity-40'
                    : 'opacity-90',
              )}
              style={{ left: `${share(start)}%`, width: `${share(end) - share(start)}%` }}
            />
          )
        })}
        {now && minutesOf(now) >= from && (
          <span
            className="pointer-events-none absolute -inset-y-1 w-0.5 rounded-full bg-accent"
            style={{ left: `${share(minutesOf(now))}%` }}
            aria-label={`teraz ${now}`}
          />
        )}
      </div>
      <div className="mt-1 flex justify-between text-2xs text-subtle" aria-hidden="true">
        {hours.map((h) => (
          <span key={h}>{h}</span>
        ))}
      </div>

      {selected && (
        <AxisPreview
          card={selected}
          axisRef={axisRef}
          // Dymek celuje w środek bloku.
          arrowAt={(share(range(selected).start) + share(range(selected).end)) / 2}
          end={shiftClock(selected.time as string, range(selected).end - range(selected).start)}
          leg={legText?.(selected.id)}
          position={`${index + 1} / ${timed.length}`}
          onPrev={index > 0 ? () => setSelectedId(timed[index - 1]?.id) : undefined}
          onNext={index < timed.length - 1 ? () => setSelectedId(timed[index + 1]?.id) : undefined}
          onOpen={() => onOpen(selected.id)}
          onClose={() => setSelectedId(undefined)}
        />
      )}
    </div>
  )
}

const GAP = 10
const MARGIN = 8

function AxisPreview({
  axisRef,
  card,
  arrowAt,
  end,
  leg,
  position,
  onPrev,
  onNext,
  onOpen,
  onClose,
}: {
  axisRef: RefObject<HTMLDivElement | null>
  card: CardSnapshot
  arrowAt: number
  end: string
  leg?: string
  position: string
  onPrev?: () => void
  onNext?: () => void
  onOpen: () => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number; arrow: number; below: boolean }>()

  // Pozycja liczona z osi na ekranie: pod osią, a gdy brakuje miejsca — nad nią.
  useLayoutEffect(() => {
    const place = () => {
      const axis = axisRef.current?.getBoundingClientRect()
      const box = ref.current?.getBoundingClientRect()
      if (!axis || !box) return
      const x = axis.left + (axis.width * arrowAt) / 100
      const left = Math.min(
        Math.max(MARGIN, x - box.width / 2),
        window.innerWidth - box.width - MARGIN,
      )
      const below = axis.bottom + GAP + box.height <= window.innerHeight - MARGIN
      const top = below ? axis.bottom + GAP : axis.top - GAP - box.height
      setPos({ left, top, arrow: Math.min(Math.max(x - left, 16), box.width - 16), below })
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [axisRef, arrowAt])

  // Dotknięcie poza dymkiem i osią albo Escape zamyka dymek.
  useEffect(() => {
    const outside = (e: PointerEvent) => {
      const target = e.target as Node
      if (ref.current?.contains(target) || axisRef.current?.contains(target)) return
      onClose()
    }
    const escape = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [axisRef, onClose])

  const style = TYPE_STYLE[card.type]
  const Icon = style.icon
  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={card.title || 'podgląd miejsca'}
      className={cx(
        'fixed z-(--z-dialog) w-[min(22rem,calc(100vw-1rem))] shadow-float rounded-island',
        pos ? 'pop-in' : 'invisible',
      )}
      style={{ left: pos?.left ?? 0, top: pos?.top ?? 0 }}
    >
      <span
        className={cx(
          'absolute z-(--z-overlay) size-3 -translate-x-1/2 rotate-45 border-line bg-raised',
          pos?.below === false ? '-bottom-1.5 border-r border-b' : '-top-1.5 border-t border-l',
        )}
        style={{ left: pos?.arrow ?? 0 }}
        aria-hidden="true"
      />
      <div className="relative flex flex-col gap-1 overflow-hidden rounded-island border border-line bg-raised p-2 pl-3">
        <span className={cx('absolute inset-y-0 left-0 w-1', style.bar)} aria-hidden="true" />
        <button type="button" onClick={onOpen} className="flex items-start gap-2 text-left">
          <span
            className={cx(
              'flex size-8 shrink-0 items-center justify-center rounded-small',
              style.chip,
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-bold">{card.title || 'bez tytułu'}</span>
            <span className="block truncate text-xs text-subtle">
              {card.time}–{end}
              {card.location?.name && ` · ⌖ ${card.location.name}`}
            </span>
          </span>
          <AmountBadge amounts={card.amounts} />
          {card.status && <StatusMark status={card.status} />}
        </button>
        {card.status === 'missing' && (
          <p className="text-xs text-amber">● {CARD_STATUS_LABELS.missing}</p>
        )}
        {leg && <p className="text-xs text-green">• {leg}</p>}
        <div className="flex items-center justify-between">
          <div className="flex items-center text-xs text-subtle">
            <button
              type="button"
              onClick={onPrev}
              disabled={!onPrev}
              aria-label="poprzednie miejsce"
              className="flex size-11 items-center justify-center hover:text-accent disabled:opacity-30"
            >
              ‹
            </button>
            {position}
            <button
              type="button"
              onClick={onNext}
              disabled={!onNext}
              aria-label="następne miejsce"
              className="flex size-11 items-center justify-center hover:text-accent disabled:opacity-30"
            >
              ›
            </button>
          </div>
          <button
            type="button"
            onClick={onOpen}
            className="min-h-11 px-1 text-xs text-accent hover:text-accent-hover"
          >
            otwórz kartę ›
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

'use client'

import {
  type AttachmentMeta,
  attachmentUrl,
  type CardSnapshot,
  dayTickets,
  formatDayHeader,
  isPdf,
  type TicketDay,
} from '@planer/core'
import { ChevronLeft, ChevronRight, CloudOff, Ticket, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { PdfPages } from '@/components/attachments/attachment-viewer'
import { TYPE_STYLE } from '@/components/card/type-style'
import { cx } from '@/components/ui'
import { useDismiss } from '@/lib/use-dismiss'
import { useHideWhenInactive } from '@/lib/use-hide-when-inactive'
import { useAttachments, useCards } from '@/lib/yjs/trip-doc'

type Slide = { card: CardSnapshot; file: AttachmentMeta }

export function useDayTickets(start: string): TicketDay[] {
  const cards = useCards()
  const attachments = useAttachments()
  return useMemo(() => dayTickets(cards, attachments, start), [cards, attachments, start])
}

/** Pliki, których nie ma jeszcze w pamięci telefonu (bez zasięgu się nie otworzą). */
function useMissing(files: AttachmentMeta[]): Set<string> {
  const [missing, setMissing] = useState<Set<string>>(new Set())
  const key = files.map((f) => f.id).join()
  useEffect(() => {
    if (typeof caches === 'undefined') return
    let cancelled = false
    void caches.open('attachments').then(async (cache) => {
      const out = new Set<string>()
      for (const f of files) if (!(await cache.match(attachmentUrl(f.id)))) out.add(f.id)
      if (!cancelled) setMissing(out)
    })
    return () => {
      cancelled = true
    }
  }, [key])
  return missing
}

/** Ekran nie gaśnie, gdy bilet jest na ekranie (skaner przy bramce). */
function useWakeLock() {
  useEffect(() => {
    let lock: WakeLockSentinel | undefined
    const take = () =>
      void navigator.wakeLock
        ?.request('screen')
        .then((l) => {
          lock = l
        })
        .catch(() => {})
    take()
    // Blokada znika po schowaniu karty przeglądarki — po powrocie bierzemy ją znowu.
    const again = () => document.visibilityState === 'visible' && take()
    document.addEventListener('visibilitychange', again)
    return () => {
      document.removeEventListener('visibilitychange', again)
      void lock?.release().catch(() => {})
    }
  }, [])
}

/** Przycisk „bilety” z liczbą plików na dziś; bez biletów w najbliższych dniach go nie ma. */
export function TicketsButton({
  start,
  compact,
  className,
}: {
  start: string
  /** Sama ikona (nagłówek dnia na Liście), tylko gdy ten dzień ma bilety. */
  compact?: boolean
  className?: string
}) {
  const days = useDayTickets(start)
  const [open, setOpen] = useState(false)
  const portal = useRef<HTMLDivElement>(null)
  useHideWhenInactive(portal)
  const today = days[0]?.items.reduce((n, i) => n + i.files.length, 0) ?? 0
  const any = days.some((d) => d.items.length)
  if (!any || (compact && !today)) return null
  return (
    <>
      {compact ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`bilety dnia · ${today}`}
          title="bilety dnia"
          className={cx('flex size-11 items-center justify-center text-accent', className)}
        >
          <Ticket className="size-4" aria-hidden="true" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cx(
            'island flex min-h-11 items-center gap-2 px-3 text-sm hover:border-accent',
            className,
          )}
        >
          <Ticket className="size-5 text-accent" aria-hidden="true" />
          <span className="font-bold">bilety</span>
          <span className="text-xs text-subtle italic">
            {today ? `dziś · ${today}` : 'w najbliższych dniach'}
          </span>
          <ChevronRight className="ml-auto size-4 text-muted" aria-hidden="true" />
        </button>
      )}
      {open &&
        createPortal(
          <div ref={portal}>
            <TicketsSheet days={days} onClose={() => setOpen(false)} />
          </div>,
          document.body,
        )}
    </>
  )
}

function TicketsSheet({ days, onClose }: { days: TicketDay[]; onClose: () => void }) {
  const [viewing, setViewing] = useState<{ slides: Slide[]; index: number } | null>(null)
  const all = days.flatMap((d) => d.items.flatMap((i) => i.files))
  const missing = useMissing(all)
  useDismiss(!viewing, onClose)
  const labels = ['dziś', 'jutro', 'pojutrze']

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="bilety"
      className="fade-in fixed inset-0 z-(--z-panel) flex flex-col bg-bg"
    >
      <header className="flex shrink-0 items-center gap-1 border-b border-line p-1 pt-[max(4px,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={onClose}
          aria-label="zamknij bilety"
          className="flex size-11 items-center justify-center text-muted hover:text-accent"
        >
          <X className="size-5" aria-hidden="true" />
        </button>
        <h2 className="font-bold">bilety</h2>
      </header>
      <div className="flex flex-1 flex-col gap-1 overflow-y-auto p-1 pb-8">
        {days.map((day, d) => {
          const slides = day.items.flatMap((i) => i.files.map((file) => ({ card: i.card, file })))
          return (
            <section key={day.date} className="flex flex-col gap-1">
              <h3 className="px-3 pt-3 pb-1 text-xs text-subtle italic">
                {labels[d]} · {formatDayHeader(day.date)}
              </h3>
              {!day.items.length && <p className="px-3 text-sm text-dim italic">bez biletów</p>}
              {day.items.map(({ card, files }) => {
                const Icon = TYPE_STYLE[card.type].icon
                return (
                  <div key={card.id} className="island flex flex-col p-1">
                    <p className="flex items-center gap-2 px-2 py-1 text-sm">
                      <Icon
                        className={cx('size-4 shrink-0', TYPE_STYLE[card.type].text)}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1 truncate font-bold">
                        {card.title || 'bez tytułu'}
                      </span>
                      {card.time && <span className="text-xs text-subtle">{card.time}</span>}
                    </p>
                    {files.map((file) => (
                      <button
                        key={file.id}
                        type="button"
                        onClick={() =>
                          setViewing({
                            slides,
                            index: slides.findIndex((s) => s.file.id === file.id),
                          })
                        }
                        className="flex min-h-11 items-center gap-2 rounded-inner px-2 text-left text-sm text-teal hover:bg-raised"
                      >
                        <span className="min-w-0 flex-1 truncate">{file.name}</span>
                        {missing.has(file.id) && (
                          <span className="flex shrink-0 items-center gap-1 text-2xs text-amber">
                            <CloudOff className="size-3.5" aria-hidden="true" />
                            pobierz, póki jest zasięg
                          </span>
                        )}
                        <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden="true" />
                      </button>
                    ))}
                  </div>
                )
              })}
            </section>
          )
        })}
      </div>
      {viewing && (
        <TicketViewer
          slides={viewing.slides}
          start={viewing.index}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  )
}

/**
 * Bilety dnia na pełnym ekranie, przesuwane palcem. Jasny motyw niezależnie od ustawień (skaner
 * kodów QR lepiej czyta jasne tło) i ekran, który nie gaśnie.
 */
function TicketViewer({
  slides,
  start,
  onClose,
}: {
  slides: Slide[]
  start: number
  onClose: () => void
}) {
  const track = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(start)
  useWakeLock()
  useDismiss(true, onClose)
  useEffect(() => {
    const el = track.current
    if (el) el.scrollLeft = el.clientWidth * start
  }, [start])
  const go = (i: number) =>
    track.current?.scrollTo({ left: track.current.clientWidth * i, behavior: 'smooth' })
  const current = slides[index]

  return (
    <div
      data-theme="light"
      role="dialog"
      aria-modal="true"
      aria-label={current ? `bilet: ${current.card.title}` : 'bilet'}
      className="fixed inset-0 z-(--z-dialog) flex flex-col bg-panel text-text"
    >
      <header className="flex shrink-0 items-center gap-1 border-b border-line p-1 pt-[max(4px,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={onClose}
          aria-label="zamknij bilet"
          className="flex size-11 items-center justify-center text-muted"
        >
          <X className="size-5" aria-hidden="true" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">
            {current?.card.title || 'bez tytułu'}
            {current?.card.time && (
              <span className="font-normal text-subtle"> · {current.card.time}</span>
            )}
          </p>
          <p className="truncate text-xs text-subtle">{current?.file.name}</p>
        </div>
        {slides.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => go(index - 1)}
              disabled={index === 0}
              aria-label="poprzedni bilet"
              className="flex size-11 items-center justify-center text-muted disabled:opacity-30"
            >
              <ChevronLeft className="size-5" aria-hidden="true" />
            </button>
            <span className="text-xs text-subtle">
              {index + 1} / {slides.length}
            </span>
            <button
              type="button"
              onClick={() => go(index + 1)}
              disabled={index === slides.length - 1}
              aria-label="następny bilet"
              className="flex size-11 items-center justify-center text-muted disabled:opacity-30"
            >
              <ChevronRight className="size-5" aria-hidden="true" />
            </button>
          </>
        )}
      </header>
      <div
        ref={track}
        onScroll={(e) => {
          const el = e.currentTarget
          setIndex(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)))
        }}
        className="flex flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden [scrollbar-width:none]"
      >
        {slides.map(({ file }, i) => (
          <div
            key={file.id}
            className="h-full w-full shrink-0 snap-center overflow-y-auto"
            style={{ touchAction: 'pan-x pan-y pinch-zoom' }}
          >
            {/* Sąsiednie slajdy rysujemy od razu, dalsze dopiero przy zbliżeniu (PDF to koszt). */}
            {Math.abs(i - index) <= 1 &&
              (isPdf(file.mime) ? (
                <PdfPages url={attachmentUrl(file.id)} />
              ) : (
                <img
                  src={attachmentUrl(file.id)}
                  alt={file.name}
                  className="mx-auto max-h-full max-w-full object-contain"
                />
              ))}
          </div>
        ))}
      </div>
    </div>
  )
}

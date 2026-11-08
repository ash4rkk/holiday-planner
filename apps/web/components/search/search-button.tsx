'use client'

import { formatShortDate, type SearchHit, searchCards } from '@planer/core'
import { Search, X } from 'lucide-react'
import { useDeferredValue, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { TYPE_STYLE } from '@/components/card/type-style'
import { cx } from '@/components/ui'
import { useDismiss } from '@/lib/use-dismiss'
import { useHideWhenInactive } from '@/lib/use-hide-when-inactive'
import { useCards, useTrip } from '@/lib/yjs/trip-doc'

// Ostatnie zapytanie wyjazdu: ponowne otwarcie lupy wraca do tych samych wyników.
const lastQuery = new Map<string, string>()

/** Lupa w nagłówku wyjazdu: szukanie po kartach na telefonie, także offline. */
export function SearchButton({ onOpenCard }: { onOpenCard: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const portal = useRef<HTMLDivElement>(null)
  useHideWhenInactive(portal)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="szukaj kart"
        title="szukaj"
        className="island flex size-11 shrink-0 items-center justify-center text-muted hover:text-accent"
      >
        <Search className="size-5" aria-hidden="true" />
      </button>
      {open &&
        createPortal(
          <div ref={portal}>
            <SearchPanel
              onClose={() => setOpen(false)}
              onOpenCard={(id) => {
                setOpen(false)
                onOpenCard(id)
              }}
            />
          </div>,
          document.body,
        )}
    </>
  )
}

/** Tekst z wyróżnionymi dopasowaniami. */
function Highlighted({ text, ranges }: { text: string; ranges: [number, number][] }) {
  const parts: React.ReactNode[] = []
  let last = 0
  for (const [a, b] of ranges) {
    if (a > last) parts.push(text.slice(last, a))
    parts.push(
      <mark key={a} className="rounded-small bg-active px-0.5 text-accent">
        {text.slice(a, b)}
      </mark>,
    )
    last = b
  }
  if (last < text.length) parts.push(text.slice(last))
  return <>{parts}</>
}

function when(hit: SearchHit): string {
  const { card } = hit
  if (card.deletedAt) return 'w koszu'
  if (card.variantOf) return 'wariant'
  if (!card.date) return 'pomysł'
  return [formatShortDate(card.date), card.time].filter(Boolean).join(' · ')
}

function SearchPanel({
  onClose,
  onOpenCard,
}: {
  onClose: () => void
  onOpenCard: (id: string) => void
}) {
  const { trip, doc, ready } = useTrip()
  // Zmiana kart (np. od drugiej osoby) odświeża wyniki.
  const cards = useCards()
  const [query, setQuery] = useState(() => lastQuery.get(trip.id) ?? '')
  const deferred = useDeferredValue(query)
  const hits = useMemo(() => searchCards(doc, deferred), [doc, deferred, cards])
  useDismiss(true, onClose)

  const change = (value: string) => {
    setQuery(value)
    lastQuery.set(trip.id, value)
  }
  const searching = deferred.trim().length > 0

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="szukaj kart"
      className="fade-in fixed inset-0 z-(--z-panel) flex flex-col bg-bg/70 lg:items-center lg:pt-16"
    >
      <section className="island flex max-h-full w-full flex-col overflow-hidden rounded-t-none border-t-0 lg:max-h-[70dvh] lg:max-w-xl lg:rounded-island lg:border-t">
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault()
            const first = hits[0]
            if (first) onOpenCard(first.card.id)
          }}
          className="flex items-center gap-1 border-b border-line p-1 pt-[max(4px,env(safe-area-inset-top))]"
        >
          <Search className="ml-3 size-4 shrink-0 text-muted" aria-hidden="true" />
          <input
            autoFocus
            type="search"
            enterKeyHint="search"
            value={query}
            onChange={(e) => change(e.target.value)}
            placeholder="szukaj w kartach, miejscach, plikach…"
            aria-label="szukaj"
            className="min-h-11 min-w-0 flex-1 bg-transparent px-2 text-text placeholder:text-dim focus:outline-none [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button
              type="button"
              onClick={() => change('')}
              aria-label="wyczyść"
              className="flex size-11 shrink-0 items-center justify-center text-dim hover:text-accent"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 shrink-0 px-3 text-sm text-muted hover:text-accent"
          >
            zamknij
          </button>
        </form>

        <div className="flex flex-col overflow-y-auto overscroll-contain p-1">
          {!ready && <p className="px-3 py-4 text-sm text-subtle italic">wczytuję plan…</p>}
          {ready && !searching && (
            <p className="px-3 py-4 text-sm text-subtle italic">
              tytuły, treść kart, miejsca, nazwy plików i kwoty · działa też bez zasięgu
            </p>
          )}
          {ready && searching && hits.length === 0 && (
            <p className="px-3 py-4 text-sm text-subtle italic">● nic nie pasuje do „{deferred}”</p>
          )}
          {hits.length > 0 && (
            <p className="px-3 pt-2 pb-1 text-2xs text-subtle italic" aria-live="polite">
              wyniki · {hits.length}
            </p>
          )}
          <ul className="flex flex-col gap-1">
            {hits.map((hit) => {
              const { card } = hit
              const style = TYPE_STYLE[card.type]
              const Icon = style.icon
              return (
                <li key={card.id}>
                  <button
                    type="button"
                    onClick={() => onOpenCard(card.id)}
                    className={cx(
                      'flex w-full items-start gap-3 rounded-inner px-3 py-2 text-left hover:bg-raised',
                      card.deletedAt && 'opacity-50',
                    )}
                  >
                    <span
                      className={cx(
                        'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-small',
                        style.chip,
                      )}
                    >
                      <Icon className="size-4" aria-hidden="true" />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="flex items-baseline gap-2">
                        <span className="min-w-0 flex-1 truncate font-bold">
                          {hit.field === 'tytuł' ? (
                            <Highlighted text={hit.snippet} ranges={hit.ranges} />
                          ) : (
                            card.title || 'bez tytułu'
                          )}
                        </span>
                        <span className="shrink-0 text-xs text-subtle italic">{when(hit)}</span>
                      </span>
                      {hit.field !== 'tytuł' && (
                        <span className="line-clamp-2 text-xs text-muted">
                          <span className="text-subtle italic">{hit.field} · </span>
                          <Highlighted text={hit.snippet} ranges={hit.ranges} />
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      </section>
      {/* Tło pod listą zamyka szukanie (na telefonie lista zajmuje zwykle cały ekran). */}
      <button
        type="button"
        aria-label="zamknij szukanie"
        tabIndex={-1}
        onClick={onClose}
        className="min-h-12 w-full flex-1 cursor-default"
      />
    </div>
  )
}

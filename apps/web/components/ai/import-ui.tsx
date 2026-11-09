'use client'

import {
  CARD_STATUS_LABELS,
  CARD_TYPE_LABELS,
  formatAmount,
  formatDayHeader,
  sumByCurrency,
  trashCard,
  updateCard,
} from '@planer/core'
import { Sparkles, X } from 'lucide-react'
import { useEffect, useSyncExternalStore } from 'react'
import { TYPE_STYLE } from '@/components/card/type-style'
import { Toast } from '@/components/toast-stack'
import { buttonClass, cx } from '@/components/ui'
import { importStore, runImports } from '@/lib/ai-import'
import { withUndo } from '@/lib/undo'
import { useDismiss } from '@/lib/use-dismiss'
import { useCards, useTrip } from '@/lib/yjs/trip-doc'

export function useImportState() {
  return useSyncExternalStore(importStore.subscribe, importStore.get, importStore.get)
}

/** Przetwarza kolejkę importu wyjazdu: po otwarciu widoku i po powrocie sieci. */
export function ImportRunner() {
  const { trip, doc, ready } = useTrip()
  useEffect(() => {
    if (!ready) return
    const run = () => void runImports(trip.id, doc)
    run()
    window.addEventListener('online', run)
    return () => window.removeEventListener('online', run)
  }, [trip.id, doc, ready])
  return null
}

/** Pasek nad menu: „AI czyta plik…”, kolejka offline, błąd importu. */
export function ImportStatus() {
  const { busy, queued, error } = useImportState()
  if (!busy && !queued && !error) return null
  return (
    <Toast>
      <div role="status" className="island flex min-h-11 max-w-md items-center gap-2 px-3 text-sm">
        <Sparkles
          className={cx(
            'size-4 shrink-0 text-accent',
            busy && 'animate-pulse motion-reduce:animate-none',
          )}
          aria-hidden="true"
        />
        {error ? (
          <>
            <span className="min-w-0 flex-1 truncate text-red">● {error}</span>
            <button
              type="button"
              onClick={importStore.dismissError}
              aria-label="zamknij"
              className="-mr-2 flex size-11 items-center justify-center text-muted"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </>
        ) : busy ? (
          <span className="truncate">AI czyta {busy}…</span>
        ) : (
          <span className="truncate text-muted">w kolejce: {queued} · wyślę, gdy wróci zasięg</span>
        )}
      </div>
    </Toast>
  )
}

/** Okienko przeglądu świeżego szkicu: dane z dokumentu i decyzja — Zatwierdź / Popraw / Odrzuć. */
export function DraftReview({ onEdit }: { onEdit: (cardId: string) => void }) {
  const { doc } = useTrip()
  const cards = useCards()
  const { fresh } = useImportState()
  const card = cards.find((c) => fresh.includes(c.id) && c.aiDraft && !c.deletedAt)
  // Esc odkłada decyzję: szkic zostaje w planie z ramką „szkic z AI”, można go zatwierdzić w karcie.
  useDismiss(!!card, () => card && importStore.reviewed(card.id))
  useEffect(() => {
    // Szkic zatwierdzony albo usunięty gdzie indziej (np. przez drugą osobę) — z kolejki przeglądu.
    for (const id of fresh) {
      const c = cards.find((x) => x.id === id)
      if (!c || !c.aiDraft || c.deletedAt) importStore.reviewed(id)
    }
  }, [cards, fresh])
  if (!card) return null
  const Icon = TYPE_STYLE[card.type].icon
  const rows = [
    card.date && [
      'kiedy',
      `${formatDayHeader(card.date)}${card.time ? `, ${card.time}` : ''}${card.endDate ? ` → ${formatDayHeader(card.endDate)}` : ''}`,
    ],
    card.location?.name && [
      'gdzie',
      `${card.location.name}${card.location.lat === undefined ? ' (bez pinezki)' : ''}`,
    ],
    card.amounts.length > 0 && ['kwota', sumByCurrency(card.amounts).map(formatAmount).join(' + ')],
    card.status && ['status', CARD_STATUS_LABELS[card.status]],
  ].filter(Boolean) as [string, string][]

  const done = (fn: () => void) => () => {
    fn()
    importStore.reviewed(card.id)
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="szkic karty z AI"
      className="fixed inset-0 z-(--z-dialog) flex items-end justify-center bg-bg/60 p-1 sm:items-center"
    >
      <section className="island w-full max-w-md border-dashed border-accent p-4">
        <p className="flex items-center gap-1 text-xs text-accent">
          <Sparkles className="size-3.5" aria-hidden="true" /> AI rozpoznało dokument — sprawdź dane
        </p>
        <div className="mt-2 flex items-start gap-2">
          <span
            className={cx(
              'flex size-9 shrink-0 items-center justify-center rounded-small',
              TYPE_STYLE[card.type].chip,
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="font-bold">{card.title}</p>
            <p className="text-xs text-subtle">{CARD_TYPE_LABELS[card.type]}</p>
          </div>
        </div>
        <dl className="mt-3 grid grid-cols-[5rem_1fr] gap-x-2 gap-y-1 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-xs text-subtle">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        {card.preview && <p className="mt-2 line-clamp-4 text-xs text-muted">{card.preview}</p>}
        <div className="mt-4 grid grid-cols-3 gap-1">
          <button
            type="button"
            onClick={done(() => withUndo(doc, 'szkic odrzucony', () => trashCard(doc, card.id)))}
            className={buttonClass('island', 'px-2')}
          >
            odrzuć
          </button>
          <button
            type="button"
            onClick={done(() => onEdit(card.id))}
            className={buttonClass('island', 'px-2')}
          >
            popraw
          </button>
          <button
            type="button"
            onClick={done(() => updateCard(doc, card.id, { aiDraft: undefined }))}
            className={buttonClass('primary', 'px-2')}
          >
            zatwierdź
          </button>
        </div>
      </section>
    </div>
  )
}

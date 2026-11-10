'use client'

import {
  addVariant,
  type CardSnapshot,
  chooseVariant,
  createCard,
  variantsByMain,
} from '@planer/core'
import { GitFork, Plus } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { useMemo } from 'react'
import { cx } from '@/components/ui'
import { useCards, useTrip } from '@/lib/yjs/trip-doc'

function useVariants(card: CardSnapshot) {
  const { doc } = useTrip()
  const pathname = usePathname()
  const cards = useCards()
  const mainId = card.variantOf ?? card.id
  const main = cards.find((c) => c.id === mainId)
  const others = useMemo(() => variantsByMain(cards).get(mainId) ?? [], [cards, mainId])
  // Zamiana, nie nowy wpis w historii: „wstecz” ma zamknąć arkusz, a nie cofać po wariantach.
  const show = (id: string) =>
    window.history.replaceState(null, '', `${pathname}?card=${encodeURIComponent(id)}`)
  const addOption = () => {
    const id = createCard(doc, { type: card.type })
    addVariant(doc, id, mainId)
    show(id)
  }
  return { doc, mainId, main, others, show, addOption }
}

/** Kafelek „wariant” wśród dodatków karty z dniem, dopóki nie ma żadnych wariantów. */
export function AddVariantChip({ card }: { card: CardSnapshot }) {
  const { others, addOption } = useVariants(card)
  if (others.length || !card.date) return null
  return (
    <button
      type="button"
      onClick={addOption}
      className="flex min-h-20 flex-col items-center justify-center gap-1 rounded-island border border-dashed border-line p-2 text-muted transition-colors hover:text-accent"
    >
      <GitFork className="size-5" aria-hidden="true" />
      <span className="text-2xs">wariant</span>
    </button>
  )
}

/** Warianty w karcie: przełączanie, wybór, wyjęcie ze stosu i dodanie nowej opcji. */
export function VariantBar({ card }: { card: CardSnapshot }) {
  const { doc, mainId, main, others, show, addOption } = useVariants(card)
  if (!main || !others.length) return null

  const picked = card.id === mainId && card.variantChosen
  return (
    <div className="island flex items-center gap-1 p-1">
      <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto [scrollbar-width:none]">
        {[main, ...others].map((c) => (
          <button
            key={c.id}
            type="button"
            aria-pressed={c.id === card.id}
            onClick={() => show(c.id)}
            className={cx(
              'min-h-11 max-w-36 shrink-0 truncate rounded-small px-2 text-xs',
              c.id === card.id ? 'bg-active font-bold text-accent' : 'text-muted',
            )}
          >
            {c.id === mainId && main.variantChosen && '• '}
            {c.title || 'bez tytułu'}
          </button>
        ))}
      </div>
      {!picked && (
        <button
          type="button"
          onClick={() => chooseVariant(doc, card.id)}
          className="min-h-11 shrink-0 rounded-small bg-accent px-2 text-xs font-bold text-on-accent"
        >
          wybierz
        </button>
      )}
      <button
        type="button"
        onClick={addOption}
        aria-label="dodaj wariant"
        className="flex size-11 shrink-0 items-center justify-center text-muted hover:text-accent"
      >
        <Plus className="size-4" aria-hidden="true" />
      </button>
    </div>
  )
}

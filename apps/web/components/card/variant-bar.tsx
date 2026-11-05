'use client'

import {
  addVariant,
  type CardSnapshot,
  chooseVariant,
  createCard,
  detachVariant,
  variantsByMain,
} from '@planer/core'
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

/** „+ wariant” w rzędzie chipów karty z dniem, dopóki nie ma żadnych wariantów. */
export function AddVariantChip({ card }: { card: CardSnapshot }) {
  const { others, addOption } = useVariants(card)
  if (others.length || !card.date) return null
  return (
    <button
      type="button"
      onClick={addOption}
      className="min-h-9 rounded-small border border-dashed border-line px-3 text-xs text-muted transition-colors hover:text-accent"
    >
      + wariant
    </button>
  )
}

/** Warianty w karcie: przełączanie, wybór, wyjęcie ze stosu i dodanie nowej opcji. */
export function VariantBar({ card }: { card: CardSnapshot }) {
  const { doc, mainId, main, others, show, addOption } = useVariants(card)
  if (!main || !others.length) return null

  const picked = card.id === mainId && card.variantChosen
  return (
    <div className="island flex flex-col gap-1 p-1">
      <div className="flex gap-1 overflow-x-auto">
        {[main, ...others].map((c) => (
          <button
            key={c.id}
            type="button"
            aria-pressed={c.id === card.id}
            onClick={() => show(c.id)}
            className={cx(
              'min-h-11 max-w-40 shrink-0 truncate rounded-small px-3 text-xs',
              c.id === card.id ? 'bg-accent/20 font-bold text-accent' : 'text-muted',
            )}
          >
            {c.id === mainId && main.variantChosen && '• '}
            {c.title || 'bez tytułu'}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1">
        {picked ? (
          <span className="px-3 text-xs text-subtle italic">wybrana</span>
        ) : (
          <button
            type="button"
            onClick={() => chooseVariant(doc, card.id)}
            className="min-h-11 rounded-small bg-accent px-3 text-xs font-bold text-on-accent"
          >
            wybierz tę
          </button>
        )}
        <span className="flex-1" />
        {card.variantOf && (
          <button
            type="button"
            onClick={() => {
              detachVariant(doc, card.id)
              show(mainId)
            }}
            className="min-h-11 px-2 text-xs text-muted"
          >
            do pomysłów
          </button>
        )}
        <button type="button" onClick={addOption} className="min-h-11 px-2 text-xs text-accent">
          dodaj wariant
        </button>
      </div>
    </div>
  )
}

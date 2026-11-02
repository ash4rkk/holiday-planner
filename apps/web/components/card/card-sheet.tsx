'use client'

import {
  CARD_TYPE_LABELS,
  CARD_TYPES,
  cardsOf,
  contentOf,
  type EditableCardFields,
  fragmentLines,
  trashCard,
  updateCard,
} from '@planer/core'
import type { Editor } from '@tiptap/react'
import { ChevronDown, Pin, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { cx } from '@/components/ui'
import { useCards, useTrip } from '@/lib/yjs/trip-doc'
import { CardEditor } from './card-editor'
import { CardFields } from './card-fields'
import { FormatToolbar } from './format-toolbar'
import { TYPE_STYLE } from './type-style'

/** Pełnoekranowy arkusz edycji karty. Pusta karta (bez treści i pól) znika przy zamknięciu. */
export function CardSheet({
  cardId,
  isNew,
  onClose,
}: {
  cardId: string
  isNew: boolean
  onClose: () => void
}) {
  const { doc } = useTrip()
  const card = useCards().find((c) => c.id === cardId)
  const cardMap = cardsOf(doc).get(cardId)
  const [editor, setEditor] = useState<Editor | null>(null)

  // Bez przewijania strony pod arkuszem.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  if (!card || !cardMap) return null

  const change = (patch: Partial<EditableCardFields>) => updateCard(doc, cardId, patch)

  const close = () => {
    const blank =
      fragmentLines(contentOf(cardMap)).length === 0 &&
      !card.date &&
      !card.time &&
      !card.location?.name &&
      !card.status
    if (blank) cardsOf(doc).delete(cardId)
    onClose()
  }

  const remove = () => {
    trashCard(doc, cardId)
    onClose()
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="karta"
      className="fixed inset-0 z-40 flex flex-col bg-bg"
    >
      <div className="flex shrink-0 gap-1 px-0.5 pt-1">
        <button
          type="button"
          onClick={close}
          aria-label="zamknij kartę"
          className="island flex size-11 items-center justify-center text-muted hover:text-accent"
        >
          <ChevronDown className="size-5" aria-hidden="true" />
        </button>
        <div className="island flex min-w-0 flex-1 items-center gap-1 overflow-x-auto px-1">
          {CARD_TYPES.map((t) => {
            const { icon: Icon, chip } = TYPE_STYLE[t]
            const active = card.type === t
            return (
              <button
                key={t}
                type="button"
                aria-pressed={active}
                aria-label={CARD_TYPE_LABELS[t]}
                onClick={() => change({ type: t })}
                className={cx(
                  'flex h-9 shrink-0 items-center gap-1 rounded-small px-2 text-xs transition-colors',
                  active ? chip : 'text-dim',
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
                {active && CARD_TYPE_LABELS[t]}
              </button>
            )
          })}
        </div>
        <button
          type="button"
          onClick={() => change({ pinned: !card.pinned })}
          aria-pressed={card.pinned}
          aria-label={card.pinned ? 'odepnij' : 'przypnij'}
          className={cx(
            'island flex size-11 items-center justify-center transition-colors',
            card.pinned ? 'text-accent' : 'text-muted',
          )}
        >
          <Pin className="size-5" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={remove}
          aria-label="przenieś do kosza"
          className="island flex size-11 items-center justify-center text-muted hover:text-red"
        >
          <Trash2 className="size-5" aria-hidden="true" />
        </button>
      </div>

      <div className="mt-1 flex-1 overflow-y-auto px-0.5 pb-24">
        <div
          className={cx('island overflow-hidden', card.aiDraft && 'border-dashed border-accent')}
        >
          <div className={cx('h-0.5', TYPE_STYLE[card.type].bar)} />
          <CardFields card={card} onChange={change} />
          <div className="border-t border-line">
            <CardEditor fragment={contentOf(cardMap)} autoFocus={isNew} onEditor={setEditor} />
          </div>
        </div>
      </div>

      {editor && <FormatToolbar editor={editor} />}
    </div>
  )
}

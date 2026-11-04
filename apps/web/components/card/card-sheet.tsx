'use client'

import {
  CARD_TYPE_LABELS,
  CARD_TYPES,
  type CardSnapshot,
  cardsOf,
  contentOf,
  type EditableCardFields,
  formatShortDate,
  fragmentLines,
  hasCoords,
  navigationUrl,
  restoreCard,
  trashCard,
  updateCard,
} from '@planer/core'
import type { Editor } from '@tiptap/react'
import { ChevronDown, Navigation, Pin, Trash2 } from 'lucide-react'
import { type PointerEvent, useEffect, useRef, useState } from 'react'
import { CardAttachments } from '@/components/attachments/card-attachments'
import { cx } from '@/components/ui'
import { offerUndo } from '@/lib/undo'
import { useCards, useTrip } from '@/lib/yjs/trip-doc'
import { CardEditor } from './card-editor'
import { CardFields, fieldsSummary } from './card-fields'
import { FormatToolbar } from './format-toolbar'
import { LinkPreviewBlock } from './link-preview'
import { TYPE_STYLE } from './type-style'

const CLOSE_MS = 190
const DRAG_CLOSE_PX = 110

/**
 * Pełnoekranowy arkusz edycji karty: wjeżdża od dołu, przeciągnięcie uchwytu w dół zamyka.
 * Treść na górze, pola zwinięte do podsumowania. Pusta karta znika przy zamknięciu.
 */
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
  const [fieldsOpen, setFieldsOpen] = useState(isNew)
  const [closing, setClosing] = useState(false)
  const [dragY, setDragY] = useState(0)
  const dragFrom = useRef<number | null>(null)

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

  const dismiss = () => {
    if (closing) return
    setClosing(true)
    setTimeout(close, CLOSE_MS)
  }

  const remove = () => {
    trashCard(doc, cardId)
    offerUndo('karta w koszu', () => restoreCard(doc, cardId))
    onClose()
  }

  const grip = {
    onPointerDown: (e: PointerEvent) => {
      dragFrom.current = e.clientY
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    onPointerMove: (e: PointerEvent) => {
      if (dragFrom.current !== null) setDragY(Math.max(0, e.clientY - dragFrom.current))
    },
    onPointerUp: () => {
      dragFrom.current = null
      if (dragY > DRAG_CLOSE_PX) dismiss()
      else setDragY(0)
    },
  }
  const summary = [
    card.date && formatShortDate(card.date),
    fieldsSummary(card),
    card.location?.name && `⌖ ${card.location.name}`,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="karta"
      className={cx(
        'fixed inset-0 z-40 flex flex-col bg-bg',
        closing ? 'sheet-out' : 'sheet-in',
        dragFrom.current === null && dragY > 0 && 'transition-transform duration-200',
      )}
      style={dragY ? { transform: `translateY(${dragY}px)` } : undefined}
    >
      <div
        {...grip}
        aria-hidden="true"
        className="flex h-4 shrink-0 touch-none items-center justify-center"
      >
        <span className="h-1 w-10 rounded-full bg-line" />
      </div>
      <div className="flex shrink-0 gap-1 px-0.5">
        <button
          type="button"
          onClick={dismiss}
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
          {card.aiDraft && (
            <div className="flex flex-wrap items-center gap-2 border-b border-dashed border-accent px-4 py-2 text-xs">
              <span className="flex-1 text-accent">● szkic z AI — sprawdź dane z dokumentu</span>
              <button
                type="button"
                onClick={() => change({ aiDraft: undefined })}
                className="min-h-9 rounded-small bg-accent px-3 font-bold text-on-accent"
              >
                zatwierdź
              </button>
              <button
                type="button"
                onClick={remove}
                className="min-h-9 rounded-small border border-line px-3 text-muted"
              >
                odrzuć
              </button>
            </div>
          )}
          <CardEditor
            cardId={cardId}
            fragment={contentOf(cardMap)}
            autoFocus={isNew}
            onEditor={setEditor}
          />
          <div className="flex items-center border-t border-line">
            <button
              type="button"
              onClick={() => setFieldsOpen((v) => !v)}
              aria-expanded={fieldsOpen}
              className="flex min-h-11 min-w-0 flex-1 items-center gap-2 px-4 text-left text-xs text-subtle italic"
            >
              <ChevronDown
                className={cx(
                  'size-4 shrink-0 transition-transform duration-200',
                  fieldsOpen && 'rotate-180',
                )}
                aria-hidden="true"
              />
              <span className="truncate">{summary || 'data, godzina, miejsce, status'}</span>
            </button>
            {hasCoords(card) && (
              <a
                href={navigationUrl(card.location)}
                target="_blank"
                rel="noreferrer"
                className="flex min-h-11 shrink-0 items-center gap-1 px-4 text-xs font-bold text-accent"
              >
                <Navigation className="size-3.5" aria-hidden="true" /> nawiguj
              </a>
            )}
          </div>
          {fieldsOpen && (
            <div className="fade-in">
              <CardFields card={card} onChange={change} />
            </div>
          )}
          {card.linkPreview && <LinkPreviewBlock preview={card.linkPreview} />}
          <CardAttachments cardId={cardId} />
        </div>
        <SaveAsTemplate card={card} editor={editor} />
      </div>

      {editor && <FormatToolbar editor={editor} />}
    </div>
  )
}

/** „Zapisz jako szablon”: treść karty jako Markdown + typ i część pól (bez dat i miejsca). */
function SaveAsTemplate({ card, editor }: { card: CardSnapshot; editor: Editor | null }) {
  const { addTemplate } = useTrip()
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  if (!editor) return null

  const save = async () => {
    const name = window.prompt('nazwa szablonu', card.title || 'szablon')?.trim()
    if (!name) return
    setState('saving')
    const res = await fetch('/api/templates', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name,
        type: card.type,
        markdown: editor.getMarkdown(),
        defaultFields: {
          ...(card.remindMin && { remindMin: card.remindMin }),
          ...(card.durationMin && { durationMin: card.durationMin }),
          ...(card.status && { status: card.status }),
        },
      }),
    }).catch(() => null)
    setState(res?.ok ? 'saved' : 'error')
    // Bez router.refresh: przy otwartej karcie (?card=) psuje późniejsze zmiany adresu przez history API.
    if (res?.ok) addTemplate(await res.json())
  }

  return (
    <button
      type="button"
      onClick={save}
      disabled={state === 'saving'}
      className="mt-2 min-h-11 px-3 text-xs text-subtle italic hover:text-accent"
    >
      {state === 'saved'
        ? '• zapisano jako szablon'
        : state === 'error'
          ? '● nie udało się zapisać szablonu'
          : 'zapisz jako szablon ›'}
    </button>
  )
}

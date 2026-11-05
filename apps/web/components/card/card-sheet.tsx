'use client'

import {
  CARD_STATUS_LABELS,
  CARD_TYPE_LABELS,
  CARD_TYPES,
  type CardSnapshot,
  cardsOf,
  contentOf,
  type EditableCardFields,
  fragmentLines,
  restoreCard,
  trashCard,
  updateCard,
} from '@planer/core'
import type { Editor } from '@tiptap/react'
import { Calendar, ChevronDown, ChevronRight, Pin, Trash2 } from 'lucide-react'
import { type PointerEvent, useEffect, useRef, useState } from 'react'
import { AmountBadge } from '@/components/amounts'
import { CardAttachments } from '@/components/attachments/card-attachments'
import { cx } from '@/components/ui'
import { offerUndo } from '@/lib/undo'
import { useWide } from '@/lib/use-wide'
import { useCards, useTrip } from '@/lib/yjs/trip-doc'
import { CardEditor } from './card-editor'
import { CardSections, Section } from './card-fields'
import { FormatToolbar, useKeyboardInset } from './format-toolbar'
import { LinkPreviewBlock } from './link-preview'
import { StatusMark } from './status-mark'
import { TYPE_STYLE } from './type-style'
import { AddVariantChip, VariantBar } from './variant-bar'

export const CARD_PANEL_WIDTH = 440

const CLOSE_MS = 190
const DRAG_CLOSE_PX = 110
const DRAG_OPEN_PX = 60

/** Pole, które otwiera klawiaturę: wybór daty i godziny ma własne okno systemowe. */
function opensKeyboard(target: EventTarget): boolean {
  return (target as HTMLElement).matches?.(
    '.ProseMirror, .ProseMirror *, textarea, input:not([type=date], [type=time], [type=checkbox], [type=file])',
  )
}

/**
 * Panel karty: na szerokim ekranie stoi z prawej obok planu, na telefonie to arkusz na pół ekranu.
 * Pełny ekran daje pociągnięcie w górę albo pisanie (po zamknięciu klawiatury arkusz wraca); chipy
 * i przyciski wysokości nie zmieniają. Sekcje są wysepkami. Pusta karta znika przy zamknięciu.
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
  const wide = useWide()
  const card = useCards().find((c) => c.id === cardId)
  const cardMap = cardsOf(doc).get(cardId)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [typing, setTyping] = useState(isNew)
  const tall = expanded || typing
  const [typesOpen, setTypesOpen] = useState(false)
  const [closing, setClosing] = useState(false)
  const [dragY, setDragY] = useState(0)
  const dragFrom = useRef<number | null>(null)
  const pulled = useRef(0)

  // Bez przewijania strony pod arkuszem; obok panelu plan dalej się przewija.
  useEffect(() => {
    if (wide) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [wide])

  // Klawiaturę można schować bez wyjścia z pola (wstecz na Androidzie), więc blur nie wystarczy.
  const keyboard = useKeyboardInset()
  const hadKeyboard = useRef(false)
  useEffect(() => {
    if (hadKeyboard.current && !keyboard) setTyping(false)
    hadKeyboard.current = keyboard > 0
  }, [keyboard])

  const dismissRef = useRef(() => {})
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && dismissRef.current()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!card || !cardMap) return null

  const change = (patch: Partial<EditableCardFields>) => updateCard(doc, cardId, patch)

  const close = () => {
    const blank =
      fragmentLines(contentOf(cardMap)).length === 0 &&
      (card.variantOf !== undefined || (!card.date && !card.time)) &&
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
  dismissRef.current = dismiss

  const remove = () => {
    trashCard(doc, cardId)
    offerUndo('karta w koszu', () => restoreCard(doc, cardId))
    onClose()
  }

  const grip = {
    onPointerDown: (e: PointerEvent) => {
      dragFrom.current = e.clientY
      pulled.current = 0
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    onPointerMove: (e: PointerEvent) => {
      if (dragFrom.current === null) return
      pulled.current = e.clientY - dragFrom.current
      setDragY(Math.max(0, pulled.current))
    },
    onPointerUp: () => {
      dragFrom.current = null
      setDragY(0)
      if (pulled.current < -DRAG_OPEN_PX) setExpanded(true)
      else if (pulled.current > DRAG_CLOSE_PX) {
        if (tall) {
          setExpanded(false)
          setTyping(false)
        } else dismiss()
      }
    },
  }

  const nextStatus = () => {
    const order = [undefined, 'missing', 'booked'] as const
    change({ status: order[(order.indexOf(card.status) + 1) % order.length] })
  }
  const style = TYPE_STYLE[card.type]
  const TypeIcon = style.icon
  const Close = wide ? ChevronRight : ChevronDown

  return (
    <>
      {!wide && !tall && (
        <button
          type="button"
          aria-label="zamknij kartę"
          onClick={dismiss}
          className="fade-in fixed inset-0 z-40 bg-bg/50"
        />
      )}
      <div
        role="dialog"
        aria-modal={!wide}
        aria-label="karta"
        className={cx(
          'fixed z-40 flex flex-col bg-bg',
          wide
            ? cx('inset-y-0 right-0 border-l border-line', closing ? 'panel-out' : 'panel-in')
            : cx(
                'inset-x-0 bottom-0 rounded-t-island border-t border-line transition-[height] duration-200 motion-reduce:transition-none',
                tall ? 'h-dvh' : 'h-[60dvh]',
                closing ? 'sheet-out' : 'sheet-in',
              ),
          dragFrom.current === null && dragY > 0 && 'transition-transform duration-200',
        )}
        style={{
          ...(wide && { width: CARD_PANEL_WIDTH }),
          ...(dragY > 0 && { transform: `translateY(${dragY}px)` }),
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
        <div className="flex shrink-0 items-center gap-1 p-1">
          <button
            type="button"
            onClick={dismiss}
            aria-label="zamknij kartę"
            className="island flex size-11 items-center justify-center text-muted hover:text-accent"
          >
            <Close className="size-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setTypesOpen((v) => !v)}
            aria-expanded={typesOpen}
            className={cx(
              'flex h-11 items-center gap-2 rounded-island px-3 text-sm transition-colors',
              style.chip,
            )}
          >
            <TypeIcon className="size-5" aria-hidden="true" />
            {CARD_TYPE_LABELS[card.type]}
          </button>
          <span className="flex-1" />
          <button
            type="button"
            onClick={nextStatus}
            aria-label={`status: ${card.status ? CARD_STATUS_LABELS[card.status] : 'brak'}, zmień`}
            title={card.status ? CARD_STATUS_LABELS[card.status] : 'bez statusu'}
            className="flex size-11 items-center justify-center"
          >
            {card.status ? (
              <StatusMark status={card.status} />
            ) : (
              <span className="flex size-8 items-center justify-center rounded-small border border-dashed border-line text-dim">
                <Calendar className="size-5" aria-hidden="true" />
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => change({ pinned: !card.pinned })}
            aria-pressed={card.pinned}
            aria-label={card.pinned ? 'odepnij' : 'przypnij'}
            className={cx(
              'flex size-11 items-center justify-center transition-colors',
              card.pinned ? 'text-accent' : 'text-muted',
            )}
          >
            <Pin className="size-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={remove}
            aria-label="przenieś do kosza"
            className="flex size-11 items-center justify-center text-muted hover:text-red"
          >
            <Trash2 className="size-5" aria-hidden="true" />
          </button>
        </div>
        {typesOpen && (
          <div className="fade-in flex shrink-0 gap-1 overflow-x-auto px-1 pb-1">
            {CARD_TYPES.map((t) => {
              const { icon: Icon, chip } = TYPE_STYLE[t]
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={card.type === t}
                  onClick={() => {
                    change({ type: t })
                    setTypesOpen(false)
                  }}
                  className={cx(
                    'flex h-9 shrink-0 items-center gap-1 rounded-small px-2 text-xs',
                    card.type === t ? chip : 'text-muted',
                  )}
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {CARD_TYPE_LABELS[t]}
                </button>
              )
            })}
          </div>
        )}

        <div
          onFocusCapture={(e) => opensKeyboard(e.target) && setTyping(true)}
          onClickCapture={(e) => opensKeyboard(e.target) && setTyping(true)}
          onBlurCapture={(e) => {
            if (!e.relatedTarget || !opensKeyboard(e.relatedTarget)) setTyping(false)
          }}
          className="flex flex-1 flex-col gap-1 overflow-y-auto overscroll-y-contain px-1 pb-24 [&>*]:shrink-0"
        >
          <VariantBar card={card} />
          <div
            className={cx('island overflow-hidden', card.aiDraft && 'border-dashed border-accent')}
          >
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
            {card.linkPreview && <LinkPreviewBlock preview={card.linkPreview} />}
          </div>
          <CardSections card={card} onChange={change} addons={<AddVariantChip card={card} />}>
            {card.amounts.length > 0 && (
              <Section label="koszt">
                <AmountBadge amounts={card.amounts} className="self-start" />
              </Section>
            )}
            <section className="island overflow-hidden">
              <CardAttachments cardId={cardId} />
            </section>
          </CardSections>
          <SaveAsTemplate card={card} editor={editor} />
        </div>

        {editor && <FormatToolbar editor={editor} />}
      </div>
    </>
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
      className="mt-2 min-h-11 self-start px-3 text-xs text-subtle italic hover:text-accent"
    >
      {state === 'saved'
        ? '• zapisano jako szablon'
        : state === 'error'
          ? '● nie udało się zapisać szablonu'
          : 'zapisz jako szablon ›'}
    </button>
  )
}

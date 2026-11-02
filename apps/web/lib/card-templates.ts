import {
  CARD_STATUSES,
  CARD_TYPES,
  type CardType,
  createCard,
  type EditableCardFields,
} from '@planer/core'
import type * as Y from 'yjs'

export type Template = {
  id: string
  name: string
  type: string
  markdown: string
  defaultFields: Record<string, unknown>
}

// Treść szablonu (Markdown) wstawia edytor przy pierwszym otwarciu nowej karty (card-editor.tsx),
// bo z Markdownu do dokumentu Yjs najprościej przez parser Tiptapa.
const pendingMarkdown = new Map<string, string>()

export function takePendingMarkdown(cardId: string): string | undefined {
  const md = pendingMarkdown.get(cardId)
  pendingMarkdown.delete(cardId)
  return md
}

/** Bezpieczny podzbiór pól domyślnych szablonu. */
function templateFields(t: Template): Partial<EditableCardFields> {
  const f = t.defaultFields
  return {
    ...(typeof f.remindMin === 'number' && { remindMin: f.remindMin }),
    ...(typeof f.durationMin === 'number' && { durationMin: f.durationMin }),
    ...(CARD_STATUSES.includes(f.status as never) && {
      status: f.status as EditableCardFields['status'],
    }),
  }
}

export function createFromTemplate(
  doc: Y.Doc,
  t: Template,
  extra: { x?: number; y?: number; date?: string } = {},
): string {
  const type = (CARD_TYPES as readonly string[]).includes(t.type) ? (t.type as CardType) : 'note'
  const id = createCard(doc, { type, ...templateFields(t), ...extra, templateId: t.id })
  pendingMarkdown.set(id, t.markdown)
  return id
}

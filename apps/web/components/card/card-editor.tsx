'use client'

import Collaboration from '@tiptap/extension-collaboration'
import CollaborationCaret from '@tiptap/extension-collaboration-caret'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { Placeholder } from '@tiptap/extensions'
import { Markdown } from '@tiptap/markdown'
import { type Editor, EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useEffect } from 'react'
import type * as Y from 'yjs'
import { takePendingMarkdown } from '@/lib/card-templates'
import { useTrip } from '@/lib/yjs/trip-doc'
import { AmountHighlight } from './amount-highlight'

/** WYSIWYG treści karty; stan żyje w Y.XmlFragment karty (współedycja w etapie 3 bez zmian tutaj). */
export function CardEditor({
  cardId,
  fragment,
  autoFocus,
  onEditor,
}: {
  cardId: string
  fragment: Y.XmlFragment
  autoFocus?: boolean
  onEditor?: (editor: Editor | null) => void
}) {
  const { provider, user } = useTrip()
  const editor = useEditor(
    {
      immediatelyRender: false,
      autofocus: autoFocus ? 'end' : false,
      extensions: [
        // Historia zmian pochodzi z Collaboration (y-undo), więc wbudowane undo jest wyłączone.
        StarterKit.configure({
          undoRedo: false,
          heading: { levels: [1, 2, 3] },
          link: { openOnClick: false, autolink: true, defaultProtocol: 'https' },
        }),
        TaskList,
        TaskItem.configure({ nested: true }),
        Placeholder.configure({ placeholder: 'tytuł w pierwszej linii, niżej notatki…' }),
        Markdown,
        AmountHighlight,
        Collaboration.configure({ fragment }),
        // Kursor drugiej osoby w tej samej karcie (pozycje z innych kart są pomijane).
        ...(provider ? [CollaborationCaret.configure({ provider, user })] : []),
      ],
      editorProps: {
        attributes: {
          class: 'card-prose min-h-[40vh] px-4 py-3 focus:outline-none',
          'aria-label': 'treść karty',
        },
      },
    },
    [fragment, provider],
  )

  // Nowa karta z szablonu: treść Markdown wchodzi przez parser Tiptapa prosto do fragmentu Yjs.
  useEffect(() => {
    if (!editor) return
    const markdown = takePendingMarkdown(cardId)
    if (markdown && fragment.length === 0) {
      editor.commands.setContent(markdown, { contentType: 'markdown' })
      editor.commands.focus('end')
    }
  }, [editor, cardId, fragment])

  useEffect(() => {
    onEditor?.(editor)
    return () => onEditor?.(null)
  }, [editor, onEditor])

  return (
    <EditorContent
      editor={editor}
      // Odhaczenie zadania czuć pod palcem.
      onChange={(e) =>
        (e.target as HTMLInputElement).type === 'checkbox' && navigator.vibrate?.(10)
      }
    />
  )
}

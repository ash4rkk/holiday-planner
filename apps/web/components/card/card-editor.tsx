'use client'

import Collaboration from '@tiptap/extension-collaboration'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { Placeholder } from '@tiptap/extensions'
import { Markdown } from '@tiptap/markdown'
import { type Editor, EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useEffect } from 'react'
import type * as Y from 'yjs'

/** WYSIWYG treści karty; stan żyje w Y.XmlFragment karty (współedycja w etapie 3 bez zmian tutaj). */
export function CardEditor({
  fragment,
  autoFocus,
  onEditor,
}: {
  fragment: Y.XmlFragment
  autoFocus?: boolean
  onEditor?: (editor: Editor | null) => void
}) {
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
        Collaboration.configure({ fragment }),
      ],
      editorProps: {
        attributes: {
          class: 'card-prose min-h-[40vh] px-4 py-3 focus:outline-none',
          'aria-label': 'treść karty',
        },
      },
    },
    [fragment],
  )

  useEffect(() => {
    onEditor?.(editor)
    return () => onEditor?.(null)
  }, [editor, onEditor])

  return <EditorContent editor={editor} />
}

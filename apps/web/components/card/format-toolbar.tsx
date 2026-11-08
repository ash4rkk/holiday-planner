'use client'

import type { Editor } from '@tiptap/react'
import { useEditorState } from '@tiptap/react'
import { Heading2, Link2, List, ListChecks, Redo2, Undo2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { askText } from '@/components/confirm-dialog'
import { cx } from '@/components/ui'

/** Odległość dolnej krawędzi widocznego obszaru od dołu okna — wysokość klawiatury na Androidzie. */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0)
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const update = () => setInset(Math.max(0, window.innerHeight - vv.height - vv.offsetTop))
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [])
  return inset
}

export function FormatToolbar({ editor }: { editor: Editor }) {
  const inset = useKeyboardInset()
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      focused: e.isFocused,
      heading: e.isActive('heading'),
      bullet: e.isActive('bulletList'),
      task: e.isActive('taskList'),
      link: e.isActive('link'),
    }),
  })
  if (!state.focused) return null

  const run = (fn: () => void) => (event: React.PointerEvent) => {
    // Bez utraty fokusu edytora (klawiatura zostaje otwarta).
    event.preventDefault()
    fn()
  }
  const chain = () => editor.chain().focus()

  const setLink = async () => {
    if (editor.isActive('link')) {
      chain().unsetLink().run()
      return
    }
    const url = await askText({
      title: 'link',
      label: 'adres linku',
      placeholder: 'https://',
      inputMode: 'url',
    })
    if (!url) return
    // Bez schematu przeglądarka potraktowałaby adres jako ścieżkę w aplikacji.
    const href = /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`
    chain().extendMarkRange('link').setLink({ href }).run()
  }

  const buttons = [
    {
      label: 'nagłówek',
      icon: Heading2,
      active: state.heading,
      fn: () => chain().toggleHeading({ level: 2 }).run(),
    },
    {
      label: 'lista',
      icon: List,
      active: state.bullet,
      fn: () => chain().toggleBulletList().run(),
    },
    {
      label: 'checklista',
      icon: ListChecks,
      active: state.task,
      fn: () => chain().toggleTaskList().run(),
    },
    { label: 'link', icon: Link2, active: state.link, fn: setLink },
  ]

  return (
    <div
      className="fixed inset-x-0 z-(--z-dialog) flex items-center gap-1 border-t border-line bg-bg px-1 py-1"
      style={{ bottom: inset }}
    >
      {buttons.map(({ label, icon: Icon, active, fn }) => (
        <button
          key={label}
          type="button"
          aria-label={label}
          aria-pressed={active}
          onPointerDown={run(fn)}
          className={cx(
            'flex size-11 items-center justify-center rounded-small transition-colors',
            active ? 'bg-active text-accent' : 'text-muted',
          )}
        >
          <Icon className="size-5" strokeWidth={1.8} aria-hidden="true" />
        </button>
      ))}
      <button
        type="button"
        aria-label="kwota"
        onPointerDown={run(() => chain().insertContent('/+').run())}
        className="flex h-11 items-center justify-center rounded-small px-3 font-bold text-orange"
      >
        /+
      </button>
      <span className="flex-1" />
      <button
        type="button"
        aria-label="cofnij"
        onPointerDown={run(() => chain().undo().run())}
        className="flex size-11 items-center justify-center text-muted"
      >
        <Undo2 className="size-5" strokeWidth={1.8} aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label="ponów"
        onPointerDown={run(() => chain().redo().run())}
        className="flex size-11 items-center justify-center text-muted"
      >
        <Redo2 className="size-5" strokeWidth={1.8} aria-hidden="true" />
      </button>
    </div>
  )
}

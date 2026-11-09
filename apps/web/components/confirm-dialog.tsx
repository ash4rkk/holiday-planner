'use client'

import { type FormEvent, type ReactNode, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { buttonClass, inputClass } from '@/components/ui'
import { useDismiss } from '@/lib/use-dismiss'

/** Szkielet okna nad wszystkim; portal, bo widoki tworzą własne konteksty warstw. Esc i tło anulują. */
export function DialogFrame({
  title,
  onCancel,
  children,
}: {
  title: string
  onCancel: () => void
  children: ReactNode
}) {
  useDismiss(true, onCancel)
  return createPortal(
    <div className="fade-in fixed inset-0 z-(--z-dialog) flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="anuluj"
        tabIndex={-1}
        onClick={onCancel}
        className="absolute inset-0 cursor-default bg-bg/70"
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        className="island pop-in shadow-float relative flex w-full max-w-sm flex-col gap-2 p-3"
      >
        <h2 className="font-bold">{title}</h2>
        {children}
      </div>
    </div>,
    document.body,
  )
}

/** Potwierdzenie; `danger` dla akcji, których nie da się cofnąć. Fokus startuje na „anuluj”. */
export function ConfirmDialog({
  title,
  body,
  confirm,
  danger,
  onConfirm,
  onCancel,
}: {
  title: string
  body: string
  confirm: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <DialogFrame title={title} onCancel={onCancel}>
      <p className="text-sm text-muted">{body}</p>
      <div className="mt-1 grid grid-cols-2 gap-1">
        <button type="button" autoFocus onClick={onCancel} className={buttonClass('island')}>
          anuluj
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className={buttonClass(danger ? 'danger' : 'primary')}
        >
          {confirm}
        </button>
      </div>
    </DialogFrame>
  )
}

/** Okno z jednym polem tekstowym (nazwa ramki, adres linku, nazwa szablonu…). */
export function PromptDialog({
  title,
  label,
  value = '',
  placeholder,
  confirm = 'zapisz',
  inputMode,
  allowEmpty,
  onSubmit,
  onCancel,
}: {
  title: string
  label?: string
  value?: string
  placeholder?: string
  confirm?: string
  inputMode?: 'text' | 'url'
  /** Pusta wartość też jest odpowiedzią (np. usunięcie etykiety). */
  allowEmpty?: boolean
  onSubmit: (value: string) => void
  onCancel: () => void
}) {
  const [text, setText] = useState(value)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const v = text.trim()
    if (v || allowEmpty) onSubmit(v)
  }
  return (
    <DialogFrame title={title} onCancel={onCancel}>
      <form onSubmit={submit} className="flex flex-col gap-2">
        <label className="flex flex-col gap-1">
          {label && <span className="text-xs text-subtle">{label}</span>}
          <input
            autoFocus
            className={inputClass}
            value={text}
            placeholder={placeholder}
            inputMode={inputMode}
            onChange={(e) => setText(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
          />
        </label>
        <div className="grid grid-cols-2 gap-1">
          <button type="button" onClick={onCancel} className={buttonClass('island')}>
            anuluj
          </button>
          <button
            type="submit"
            disabled={!allowEmpty && !text.trim()}
            className={buttonClass('primary')}
          >
            {confirm}
          </button>
        </div>
      </form>
    </DialogFrame>
  )
}

// Wywołanie z kodu (zamiast window.confirm / window.prompt): okno rysuje DialogHost w layoucie.

type ConfirmAsk = {
  kind: 'confirm'
  title: string
  body: string
  confirm: string
  danger?: boolean
}
type TextAsk = {
  kind: 'text'
  title: string
  label?: string
  value?: string
  placeholder?: string
  confirm?: string
  inputMode?: 'text' | 'url'
  allowEmpty?: boolean
}
type Pending = (ConfirmAsk | TextAsk) & { resolve: (value: unknown) => void }

let pending: Pending | null = null
const listeners = new Set<() => void>()
const setPending = (value: Pending | null) => {
  pending = value
  for (const l of listeners) l()
}
const store = {
  subscribe: (cb: () => void) => {
    listeners.add(cb)
    return () => listeners.delete(cb)
  },
  get: () => pending,
}

function ask<T>(question: ConfirmAsk | TextAsk, cancelled: T): Promise<T> {
  pending?.resolve(cancelled)
  return new Promise<T>((resolve) => {
    setPending({ ...question, resolve: resolve as (value: unknown) => void })
  })
}

/** Potwierdzenie z kodu: `true` po zgodzie. */
export function askConfirm(q: Omit<ConfirmAsk, 'kind'>): Promise<boolean> {
  return ask({ kind: 'confirm', ...q }, false)
}

/** Tekst z kodu: wpisana wartość albo `null` po anulowaniu. */
export function askText(q: Omit<TextAsk, 'kind'>): Promise<string | null> {
  return ask<string | null>({ kind: 'text', ...q }, null)
}

export function DialogHost() {
  const q = useSyncExternalStore(store.subscribe, store.get, () => null)
  if (!q) return null
  const answer = (value: unknown) => {
    setPending(null)
    q.resolve(value)
  }
  if (q.kind === 'confirm') {
    return (
      <ConfirmDialog
        title={q.title}
        body={q.body}
        confirm={q.confirm}
        danger={q.danger}
        onConfirm={() => answer(true)}
        onCancel={() => answer(false)}
      />
    )
  }
  return (
    <PromptDialog
      title={q.title}
      label={q.label}
      value={q.value}
      placeholder={q.placeholder}
      confirm={q.confirm}
      inputMode={q.inputMode}
      allowEmpty={q.allowEmpty}
      onSubmit={(v) => answer(v)}
      onCancel={() => answer(null)}
    />
  )
}

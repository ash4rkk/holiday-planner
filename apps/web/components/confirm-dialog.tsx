'use client'

import { createPortal } from 'react-dom'

/** Okienko potwierdzenia nad wszystkim; portal, bo widoki tworzą własne konteksty warstw. */
export function ConfirmDialog({
  title,
  body,
  confirm,
  onConfirm,
  onCancel,
}: {
  title: string
  body: string
  confirm: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return createPortal(
    <div className="fade-in fixed inset-0 z-50 flex items-center justify-center bg-bg/70 p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        className="island flex w-full max-w-sm flex-col gap-2 p-3"
      >
        <h2 className="font-bold">{title}</h2>
        <p className="text-sm text-muted">{body}</p>
        <div className="mt-1 grid grid-cols-2 gap-1">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-11 rounded-small border border-line text-sm text-muted"
          >
            anuluj
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="min-h-11 rounded-small bg-accent text-sm font-bold text-on-accent"
          >
            {confirm}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

'use client'

import { useSyncExternalStore } from 'react'
import { Toast } from '@/components/toast-stack'
import { undoStore } from '@/lib/undo'

export function UndoToast() {
  const undo = useSyncExternalStore(undoStore.subscribe, undoStore.get, () => null)
  if (!undo) return null
  return (
    <Toast>
      <div
        role="status"
        className="island pop-in flex min-h-11 items-center gap-3 pr-1 pl-4 text-sm"
      >
        <span>{undo.label}</span>
        <button
          type="button"
          onClick={() => {
            undo.run()
            undoStore.dismiss()
          }}
          className="min-h-11 px-3 font-bold text-accent"
        >
          cofnij
        </button>
      </div>
    </Toast>
  )
}

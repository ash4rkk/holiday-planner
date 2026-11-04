'use client'

import { useSyncExternalStore } from 'react'
import { undoStore } from '@/lib/undo'

export function UndoToast() {
  const undo = useSyncExternalStore(undoStore.subscribe, undoStore.get, () => null)
  if (!undo) return null
  return (
    <div className="fixed inset-x-1 bottom-[calc(76px+env(safe-area-inset-bottom))] z-30 flex justify-center">
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
    </div>
  )
}

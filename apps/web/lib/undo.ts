'use client'

// Pasek „cofnij” po usunięciu karty: jedna akcja naraz, znika sam.

type Undo = { label: string; run: () => void }
const VISIBLE_MS = 6000

let current: Undo | null = null
let timer: ReturnType<typeof setTimeout> | undefined
const listeners = new Set<() => void>()
const set = (value: Undo | null) => {
  current = value
  for (const l of listeners) l()
}

export const undoStore = {
  subscribe: (cb: () => void) => {
    listeners.add(cb)
    return () => listeners.delete(cb)
  },
  get: () => current,
  dismiss: () => set(null),
}

export function offerUndo(label: string, run: () => void) {
  clearTimeout(timer)
  set({ label, run })
  timer = setTimeout(() => set(null), VISIBLE_MS)
}

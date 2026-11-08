'use client'

// Pasek „cofnij” po odwracalnej akcji (kosz, pomysły, pominięcie…): jedna akcja naraz, znika sam.

import { undoable } from '@planer/core'
import type * as Y from 'yjs'

type Undo = { label: string; run: () => void; dispose?: () => void }
const VISIBLE_MS = 6000

let current: Undo | null = null
let timer: ReturnType<typeof setTimeout> | undefined
const listeners = new Set<() => void>()
const set = (value: Undo | null) => {
  if (current && current !== value) current.dispose?.()
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

export function offerUndo(label: string, run: () => void, dispose?: () => void) {
  clearTimeout(timer)
  set({ label, run, dispose })
  timer = setTimeout(() => set(null), VISIBLE_MS)
}

/** Zmiana kart od razu, bez pytania; pasek „cofnij” odwraca dokładnie ją. */
export function withUndo(doc: Y.Doc, label: string, change: () => void) {
  const { undo, dispose } = undoable(doc, change)
  offerUndo(label, undo, dispose)
}

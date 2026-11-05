'use client'

import { createContext, useContext } from 'react'

export type Selection = { kind: 'card' | 'frame' | 'edge'; id: string } | null

export type BoardApi = {
  select: (sel: Selection) => void
  openCard: (id: string) => void
  dragStart: (kind: 'card' | 'frame', id: string) => void
  dragMove: (dx: number, dy: number) => void
  dragEnd: () => void
  panBy: (dx: number, dy: number) => void
  toggleGroup: (id: string) => void
  togglePin: (id: string) => void
  chooseVariant: (id: string) => void
  trash: (id: string) => void
  renameFrame: (id: string) => void
  deleteFrame: (id: string) => void
  resizeFrame: (id: string, rect: { x: number; y: number; w: number; h: number }) => void
  labelEdge: (id: string) => void
  deleteEdge: (id: string) => void
}

export const BoardContext = createContext<BoardApi | null>(null)

export function useBoard(): BoardApi {
  const api = useContext(BoardContext)
  if (!api) throw new Error('useBoard poza tablicą')
  return api
}

export const frameNodeId = (id: string) => `frame:${id}`

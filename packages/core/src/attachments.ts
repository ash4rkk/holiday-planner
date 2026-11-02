import * as Y from 'yjs'

// Załączniki w dokumencie wyjazdu: attachments: Y.Map<attachmentId, Y.Map{ cardId, name, mime, size, createdAt }>.
// Osobna mapa (zamiast listy w karcie), żeby dwie osoby dodające pliki naraz nie nadpisały sobie zmian.
// Same pliki leżą na serwerze (/api/attachments/<id>); tu tylko to, co potrzebne do wyświetlenia offline.

export type AttachmentMeta = {
  id: string
  cardId: string
  name: string
  mime: string
  size: number
  createdAt: string
}

export function attachmentsOf(doc: Y.Doc): Y.Map<Y.Map<unknown>> {
  return doc.getMap<Y.Map<unknown>>('attachments')
}

export function attachFile(doc: Y.Doc, meta: AttachmentMeta) {
  const { id, ...rest } = meta
  const map = new Y.Map<unknown>()
  for (const [k, v] of Object.entries(rest)) map.set(k, v)
  attachmentsOf(doc).set(id, map)
}

export function detachFile(doc: Y.Doc, id: string) {
  attachmentsOf(doc).delete(id)
}

export function readAttachments(doc: Y.Doc): AttachmentMeta[] {
  return [...attachmentsOf(doc).entries()]
    .map(([id, m]) => ({ id, ...(m.toJSON() as Omit<AttachmentMeta, 'id'>) }))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export const isImage = (mime: string) => mime.startsWith('image/')
export const isPdf = (mime: string) => mime === 'application/pdf'

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`
}

export const attachmentUrl = (id: string) => `/api/attachments/${id}`

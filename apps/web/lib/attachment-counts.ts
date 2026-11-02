import type { AttachmentMeta } from '@planer/core'

export function countByCard(attachments: AttachmentMeta[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const a of attachments) counts.set(a.cardId, (counts.get(a.cardId) ?? 0) + 1)
  return counts
}

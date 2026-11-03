import 'server-only'
import type Anthropic from '@anthropic-ai/sdk'
import sharp from 'sharp'
import { getAttachment, readAttachmentFile } from '@/lib/attachments'

type Block = Anthropic.Beta.BetaImageBlockParam | Anthropic.Beta.BetaRequestDocumentBlock

/**
 * Załącznik jako blok dla modelu: PDF w całości, zdjęcie zmniejszone do 2000 px po dłuższym boku
 * (czytelny bilet przy kilku tysiącach tokenów zamiast kilkunastu).
 */
export async function attachmentBlock(
  id: string,
  tripId: string,
): Promise<{ block: Block; name: string } | { error: string }> {
  const row = await getAttachment(id)
  if (!row || row.tripId !== tripId) return { error: 'nie ma takiego pliku w tym wyjeździe' }
  const bytes = await readAttachmentFile(row).catch(() => null)
  if (!bytes) return { error: 'plik zniknął z dysku' }
  if (row.mime === 'application/pdf') {
    return {
      name: row.filename,
      block: {
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: bytes.toString('base64') },
        title: row.filename,
      },
    }
  }
  try {
    const jpeg = await sharp(bytes)
      .rotate()
      .resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer()
    return {
      name: row.filename,
      block: {
        type: 'image',
        source: { type: 'base64', media_type: 'image/jpeg', data: jpeg.toString('base64') },
      },
    }
  } catch {
    return { error: `nie udało się odczytać zdjęcia ${row.filename} (format nieobsługiwany?)` }
  }
}

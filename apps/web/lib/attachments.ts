import 'server-only'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { type Attachment, and, attachments, desc, eq, getDb } from '@planer/core/db'

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024

/** Katalog plików: wolumen na serwerze (UPLOAD_DIR), lokalnie apps/web/uploads. */
export function uploadDir(): string {
  // turbopackIgnore: ścieżka znana dopiero w czasie działania — bez śledzenia całego projektu do builda.
  return path.resolve(/* turbopackIgnore: true */ process.env.UPLOAD_DIR ?? 'uploads')
}

/**
 * Typ pliku z pierwszych bajtów, nie z nazwy ani nagłówka klienta — serwujemy tylko obrazy i PDF-y,
 * więc podrzucony HTML udający zdjęcie nie wykona się w przeglądarce.
 */
export function sniffMime(bytes: Uint8Array): string | undefined {
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to))
  if (ascii(0, 5) === '%PDF-') return 'application/pdf'
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (ascii(1, 4) === 'PNG' && bytes[0] === 0x89) return 'image/png'
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp'
  if (ascii(0, 4) === 'GIF8') return 'image/gif'
  if (ascii(4, 8) === 'ftyp') {
    const brand = ascii(8, 12)
    if (['heic', 'heix', 'hevc', 'heim', 'heis', 'mif1', 'msf1'].includes(brand))
      return 'image/heic'
    if (brand === 'avif' || brand === 'avis') return 'image/avif'
  }
  return undefined
}

/** Zapis pliku; ten sam plik (sha256) w tym samym wyjeździe zwraca istniejący wpis. */
export async function saveAttachment(input: {
  tripId: string
  filename: string
  bytes: Uint8Array
  createdBy: string
}): Promise<Attachment | { error: string }> {
  const mime = sniffMime(input.bytes)
  if (!mime) return { error: 'obsługiwane są tylko zdjęcia i PDF-y' }
  if (input.bytes.byteLength > MAX_UPLOAD_BYTES) return { error: 'plik większy niż 20 MB' }

  const sha256 = createHash('sha256').update(input.bytes).digest('hex')
  const db = getDb()
  const [existing] = await db
    .select()
    .from(attachments)
    .where(and(eq(attachments.tripId, input.tripId), eq(attachments.sha256, sha256)))
  if (existing) return existing

  const id = randomUUID()
  const relative = path.join(input.tripId, id)
  await mkdir(path.join(/* turbopackIgnore: true */ uploadDir(), input.tripId), { recursive: true })
  await writeFile(path.join(/* turbopackIgnore: true */ uploadDir(), relative), input.bytes)
  const [created] = await db
    .insert(attachments)
    .values({
      id,
      tripId: input.tripId,
      filename: input.filename.slice(0, 200) || 'plik',
      mime,
      size: input.bytes.byteLength,
      path: relative,
      sha256,
      createdBy: input.createdBy,
    })
    .returning()
  if (!created) throw new Error('Nie udało się zapisać pliku')
  return created
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function getAttachment(id: string): Promise<Attachment | undefined> {
  if (!UUID.test(id)) return undefined
  const [row] = await getDb().select().from(attachments).where(eq(attachments.id, id))
  return row
}

export async function readAttachmentFile(row: Attachment): Promise<Buffer> {
  const file = path.resolve(/* turbopackIgnore: true */ uploadDir(), row.path)
  // Ścieżka z bazy, ale i tak pilnujemy, żeby nie wyszła poza katalog plików.
  if (!file.startsWith(uploadDir() + path.sep)) throw new Error('nieprawidłowa ścieżka pliku')
  return readFile(file)
}

export async function listAttachments(tripId: string): Promise<Attachment[]> {
  return getDb()
    .select()
    .from(attachments)
    .where(eq(attachments.tripId, tripId))
    .orderBy(desc(attachments.createdAt))
}

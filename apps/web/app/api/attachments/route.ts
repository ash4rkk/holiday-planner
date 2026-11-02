import { listAttachments, MAX_UPLOAD_BYTES, saveAttachment } from '@/lib/attachments'
import { getCurrentUser } from '@/lib/auth/user'
import { getTrip } from '@/lib/trips'

const meta = ({
  id,
  filename,
  mime,
  size,
  createdAt,
}: {
  id: string
  filename: string
  mime: string
  size: number
  createdAt: Date
}) => ({
  id,
  name: filename,
  mime,
  size,
  createdAt: createdAt.toISOString(),
})

/** Upload pliku do wyjazdu (multipart: tripId, file). */
export async function POST(request: Request) {
  const user = await getCurrentUser()
  const form = await request.formData().catch(() => null)
  const tripId = form?.get('tripId')
  const file = form?.get('file')
  if (typeof tripId !== 'string' || !(file instanceof File)) {
    return Response.json({ error: 'brak pliku' }, { status: 400 })
  }
  if (file.size > MAX_UPLOAD_BYTES)
    return Response.json({ error: 'plik większy niż 20 MB' }, { status: 413 })
  if (!(await getTrip(tripId)))
    return Response.json({ error: 'nie ma takiego wyjazdu' }, { status: 404 })

  const saved = await saveAttachment({
    tripId,
    filename: file.name,
    bytes: new Uint8Array(await file.arrayBuffer()),
    createdBy: user.id,
  })
  if ('error' in saved) return Response.json(saved, { status: 415 })
  return Response.json(meta(saved))
}

/** Lista plików wyjazdu — do pobrania wszystkiego do pamięci offline. */
export async function GET(request: Request) {
  const tripId = new URL(request.url).searchParams.get('tripId')
  if (!tripId || !(await getTrip(tripId)))
    return Response.json({ error: 'nie ma takiego wyjazdu' }, { status: 404 })
  return Response.json((await listAttachments(tripId)).map(meta), {
    headers: { 'cache-control': 'no-store' },
  })
}

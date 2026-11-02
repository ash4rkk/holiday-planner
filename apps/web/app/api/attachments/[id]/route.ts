import { getAttachment, readAttachmentFile } from '@/lib/attachments'

/** Plik załącznika. Id jest niezmienny, więc przeglądarka i SW mogą go trzymać bez końca. */
export async function GET(_: Request, { params }: RouteContext<'/api/attachments/[id]'>) {
  const row = await getAttachment((await params).id)
  if (!row) return new Response('nie ma takiego pliku', { status: 404 })
  const body = await readAttachmentFile(row).catch(() => null)
  if (!body) return new Response('plik zniknął z dysku', { status: 410 })
  return new Response(new Uint8Array(body), {
    headers: {
      'content-type': row.mime,
      'content-length': String(body.byteLength),
      'content-disposition': `inline; filename*=UTF-8''${encodeURIComponent(row.filename)}`,
      'cache-control': 'private, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
      // Otwarty bezpośrednio plik nie wykona skryptów ani nie dostanie się do aplikacji.
      'content-security-policy':
        "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
    },
  })
}

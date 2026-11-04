import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { uploadDir } from '@/lib/attachments'

// Zdjęcia profili leżą tylko na serwerze (UPLOAD_DIR/profiles/<imię>.jpg), bo repo jest publiczne.
// Same litery w imieniu — z adresu nie da się wyjść poza katalog.
const NAME = /^\p{L}{1,30}$/u

export async function GET(_: Request, { params }: RouteContext<'/api/profile-photo/[name]'>) {
  const { name } = await params
  if (!NAME.test(name)) return new Response(null, { status: 404 })
  const file = await readFile(path.join(uploadDir(), 'profiles', `${name}.jpg`)).catch(() => null)
  if (!file) return new Response(null, { status: 404 })
  return new Response(file, {
    headers: { 'content-type': 'image/jpeg', 'cache-control': 'private, max-age=86400' },
  })
}

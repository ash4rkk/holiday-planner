import { type NextRequest, NextResponse } from 'next/server'
import {
  ACCESS_COOKIE,
  ACCESS_HEADER,
  isPublicPath,
  readAccessConfig,
  USER_EMAIL_HEADER,
  verifyAccessToken,
} from '@/lib/auth/access'

export async function proxy(request: NextRequest) {
  const headers = new Headers(request.headers)
  // Nagłówek ustawia wyłącznie proxy — nigdy nie ufamy wartości z zewnątrz.
  headers.delete(USER_EMAIL_HEADER)

  // Bez logowania i bez tożsamości, także w dev: kod za tymi adresami nigdy nie widzi e-maila.
  if (isPublicPath(request.nextUrl.pathname)) return NextResponse.next({ request: { headers } })

  const devEmail = process.env.AUTH_DEV_EMAIL
  if (process.env.NODE_ENV === 'development' && devEmail) {
    headers.set(USER_EMAIL_HEADER, devEmail.toLowerCase())
    return NextResponse.next({ request: { headers } })
  }

  const token = request.headers.get(ACCESS_HEADER) ?? request.cookies.get(ACCESS_COOKIE)?.value
  const result = await verifyAccessToken(token, readAccessConfig())
  if (!result.ok) {
    return new NextResponse(`brak dostępu: ${result.reason}`, {
      status: result.status,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    })
  }

  headers.set(USER_EMAIL_HEADER, result.email)
  return NextResponse.next({ request: { headers } })
}

export const config = {
  // Proxy pomija tylko statyki Next. Ścieżki publiczne (`isPublicPath`) też przez nie przechodzą:
  // bez weryfikacji JWT, ale z usuniętym nagłówkiem e-maila.
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico).*)'],
}

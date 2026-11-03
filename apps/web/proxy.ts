import { type NextRequest, NextResponse } from 'next/server'
import {
  ACCESS_COOKIE,
  ACCESS_HEADER,
  readAccessConfig,
  USER_EMAIL_HEADER,
  verifyAccessToken,
} from '@/lib/auth/access'

export async function proxy(request: NextRequest) {
  const headers = new Headers(request.headers)
  // Nagłówek ustawia wyłącznie proxy — nigdy nie ufamy wartości z zewnątrz.
  headers.delete(USER_EMAIL_HEADER)

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
  // Poza logowaniem: statyki Next, zdrowie dla healthchecku, publiczny link /p/* (etap 8),
  // manifest, ikony i strona offline (przeglądarka pobiera manifest bez cookie Access), worker mapy
  // (potrzebny też stronie publicznej).
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|api/health|p/|manifest\\.webmanifest|icons/|offline|maplibre-gl-worker\\.mjs).*)',
  ],
}

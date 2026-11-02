import {
  ACCESS_COOKIE,
  ACCESS_HEADER,
  readAccessConfig,
  verifyAccessToken,
} from '@planer/core/access'

function cookie(headers: Headers, name: string): string | undefined {
  for (const part of (headers.get('cookie') ?? '').split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) return rest.join('=')
  }
  return undefined
}

/**
 * E-mail osoby łączącej się przez WebSocket. Cloudflare dokleja JWT Access do nagłówka także przy
 * upgrade; zapasowo cookie CF_Authorization (ta sama domena co aplikacja).
 */
export async function authenticate(headers: Headers): Promise<string> {
  const devEmail = process.env.AUTH_DEV_EMAIL
  if (process.env.NODE_ENV === 'development' && devEmail) return devEmail.toLowerCase()

  const token = headers.get(ACCESS_HEADER) ?? cookie(headers, ACCESS_COOKIE)
  const result = await verifyAccessToken(token, readAccessConfig())
  if (!result.ok) throw new Error(`brak dostępu: ${result.reason}`)
  return result.email
}

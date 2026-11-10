import { createRemoteJWKSet, type JWTVerifyGetKey, jwtVerify } from 'jose'
import { parseEmailList } from './users'

// Weryfikacja JWT z Cloudflare Access:
// https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/validating-json/

export const ACCESS_HEADER = 'cf-access-jwt-assertion'
export const ACCESS_COOKIE = 'CF_Authorization'
export const USER_EMAIL_HEADER = 'x-user-email'

/**
 * WebSocket nie podlega same-origin, a przeglądarka dokleja do niego cookie Access — bez tego cudza
 * strona mogłaby łączyć się z sync w sesji zalogowanej osoby. Klient spoza przeglądarki nie wysyła
 * Origin, ale nie ma też cookie ofiary, więc wystarcza mu sam JWT.
 */
export function isAppOrigin(origin: string | null, env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.NODE_ENV === 'development' || origin === null) return true
  return origin === (env.APP_ORIGIN ?? 'https://planer.wiergowsky.com')
}

const PUBLIC_EXACT = new Set([
  '/api/health',
  '/manifest.webmanifest',
  '/offline',
  '/maplibre-gl-worker.mjs',
])
const PUBLIC_PREFIXES = ['/p/', '/icons/']

/**
 * Ścieżki poza logowaniem: zdrowie dla healthchecku, link dla rodziny, manifest, ikony, strona
 * offline, worker mapy. Proxy i tak przez nie przechodzi, żeby usunąć nagłówek z e-mailem: akcję
 * serwera da się wywołać POST-em na dowolny adres, więc bez tego obcy podałby się tu za osobę.
 */
export function isPublicPath(pathname: string): boolean {
  return PUBLIC_EXACT.has(pathname) || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))
}

export type AccessConfig = {
  teamDomain: string
  aud: string
  allowedEmails: string[]
}

export type AccessResult =
  | { ok: true; email: string }
  | { ok: false; status: 401 | 403; reason: string }

export function readAccessConfig(env: NodeJS.ProcessEnv = process.env): AccessConfig {
  return {
    teamDomain: (env.CF_ACCESS_TEAM_DOMAIN ?? '').replace(/^https?:\/\//, '').replace(/\/$/, ''),
    aud: env.CF_ACCESS_AUD ?? '',
    allowedEmails: parseEmailList(env.ALLOWED_EMAILS),
  }
}

const jwksByDomain = new Map<string, JWTVerifyGetKey>()

function remoteJwks(teamDomain: string): JWTVerifyGetKey {
  let jwks = jwksByDomain.get(teamDomain)
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`))
    jwksByDomain.set(teamDomain, jwks)
  }
  return jwks
}

export async function verifyAccessToken(
  token: string | null | undefined,
  config: AccessConfig,
  getKey: JWTVerifyGetKey = remoteJwks(config.teamDomain),
): Promise<AccessResult> {
  if (!config.teamDomain || !config.aud) {
    return { ok: false, status: 401, reason: 'brak konfiguracji Cloudflare Access' }
  }
  if (!token) return { ok: false, status: 401, reason: 'brak tokenu' }

  let email: unknown
  try {
    const { payload } = await jwtVerify(token, getKey, {
      issuer: `https://${config.teamDomain}`,
      audience: config.aud,
    })
    email = payload.email
  } catch {
    return { ok: false, status: 401, reason: 'nieprawidłowy token' }
  }

  // Tokeny usługowe nie mają e-maila — tu wpuszczamy tylko ludzi.
  if (typeof email !== 'string' || !email) {
    return { ok: false, status: 403, reason: 'token bez e-maila' }
  }
  const normalized = email.toLowerCase()
  // Lista opcjonalna: token z tym `aud` wystawia tylko Access po przejściu polityki aplikacji.
  if (config.allowedEmails.length && !config.allowedEmails.includes(normalized)) {
    return { ok: false, status: 403, reason: 'konto spoza listy' }
  }
  return { ok: true, email: normalized }
}

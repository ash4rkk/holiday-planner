import { parseEmailList } from '@planer/core'
import { createRemoteJWKSet, type JWTVerifyGetKey, jwtVerify } from 'jose'

// Weryfikacja JWT z Cloudflare Access:
// https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/validating-json/

export const ACCESS_HEADER = 'cf-access-jwt-assertion'
export const ACCESS_COOKIE = 'CF_Authorization'
export const USER_EMAIL_HEADER = 'x-user-email'

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
  if (!config.teamDomain || !config.aud || config.allowedEmails.length === 0) {
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
  if (!config.allowedEmails.includes(normalized)) {
    return { ok: false, status: 403, reason: 'konto spoza listy' }
  }
  return { ok: true, email: normalized }
}

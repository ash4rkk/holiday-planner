import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose'
import { beforeAll, describe, expect, it } from 'vitest'
import { type AccessConfig, readAccessConfig, verifyAccessToken } from './access'

const config: AccessConfig = {
  teamDomain: 'zespol.cloudflareaccess.com',
  aud: 'aud-planer',
  allowedEmails: ['arek@example.com', 'ola@example.com'],
}

let privateKey: CryptoKey
let jwks: ReturnType<typeof createLocalJWKSet>

beforeAll(async () => {
  const pair = await generateKeyPair('RS256')
  privateKey = pair.privateKey
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'RS256' }
  jwks = createLocalJWKSet({ keys: [jwk] })
})

function sign(
  claims: Record<string, unknown>,
  opts: { aud?: string; iss?: string; exp?: string } = {},
) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
    .setIssuer(opts.iss ?? `https://${config.teamDomain}`)
    .setAudience(opts.aud ?? config.aud)
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? '1h')
    .sign(privateKey)
}

describe('verifyAccessToken', () => {
  it('wpuszcza osobę z listy', async () => {
    const token = await sign({ email: 'Arek@Example.com' })
    expect(await verifyAccessToken(token, config, jwks)).toEqual({
      ok: true,
      email: 'arek@example.com',
    })
  })

  it('odrzuca brak tokenu', async () => {
    expect(await verifyAccessToken(undefined, config, jwks)).toMatchObject({
      ok: false,
      status: 401,
    })
  })

  it('odrzuca zły aud', async () => {
    const token = await sign({ email: 'arek@example.com' }, { aud: 'inna-aplikacja' })
    expect(await verifyAccessToken(token, config, jwks)).toMatchObject({ ok: false, status: 401 })
  })

  it('odrzuca zły issuer', async () => {
    const token = await sign(
      { email: 'arek@example.com' },
      { iss: 'https://obcy.cloudflareaccess.com' },
    )
    expect(await verifyAccessToken(token, config, jwks)).toMatchObject({ ok: false, status: 401 })
  })

  it('odrzuca wygasły token', async () => {
    const token = await sign({ email: 'arek@example.com' }, { exp: '-1m' })
    expect(await verifyAccessToken(token, config, jwks)).toMatchObject({ ok: false, status: 401 })
  })

  it('odrzuca podpis innym kluczem', async () => {
    const other = await generateKeyPair('RS256')
    const token = await new SignJWT({ email: 'arek@example.com' })
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuer(`https://${config.teamDomain}`)
      .setAudience(config.aud)
      .setExpirationTime('1h')
      .sign(other.privateKey)
    expect(await verifyAccessToken(token, config, jwks)).toMatchObject({ ok: false, status: 401 })
  })

  it('odrzuca e-mail spoza listy (403)', async () => {
    const token = await sign({ email: 'obcy@example.com' })
    expect(await verifyAccessToken(token, config, jwks)).toMatchObject({ ok: false, status: 403 })
  })

  it('odrzuca token usługowy bez e-maila (403)', async () => {
    const token = await sign({ common_name: 'service' })
    expect(await verifyAccessToken(token, config, jwks)).toMatchObject({ ok: false, status: 403 })
  })

  it('bez listy e-maili decyduje polityka Access, token nadal jest sprawdzany', async () => {
    const open = { ...config, allowedEmails: [] }
    const token = await sign({ email: 'ktos@example.com' })
    expect(await verifyAccessToken(token, open, jwks)).toMatchObject({
      ok: true,
      email: 'ktos@example.com',
    })
    expect(await verifyAccessToken('zly', open, jwks)).toMatchObject({ ok: false, status: 401 })
    expect(await verifyAccessToken(null, open, jwks)).toMatchObject({ ok: false, status: 401 })
  })

  it('bez konfiguracji nikogo nie wpuszcza', async () => {
    const token = await sign({ email: 'arek@example.com' })
    const empty = readAccessConfig({ NODE_ENV: 'test' })
    expect(await verifyAccessToken(token, empty, jwks)).toMatchObject({ ok: false, status: 401 })
  })
})

describe('readAccessConfig', () => {
  it('normalizuje domenę i listę', () => {
    expect(
      readAccessConfig({
        NODE_ENV: 'test',
        CF_ACCESS_TEAM_DOMAIN: 'https://zespol.cloudflareaccess.com/',
        CF_ACCESS_AUD: 'x',
        ALLOWED_EMAILS: 'A@b.pl',
      }),
    ).toEqual({ teamDomain: 'zespol.cloudflareaccess.com', aud: 'x', allowedEmails: ['a@b.pl'] })
  })
})

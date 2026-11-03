import 'server-only'
import { lookup as dnsLookup, type LookupAddress } from 'node:dns'
import http from 'node:http'
import https from 'node:https'
import { isIP, type LookupFunction } from 'node:net'
import ipaddr from 'ipaddr.js'

// Pobieranie stron spod adresów podanych przez użytkownika (podgląd linku) bez SSRF:
// tylko http(s), tylko publiczne adresy IP — nazwy sprawdzane w samym lookupie gniazda, więc DNS
// nie może po walidacji podmienić adresu na wewnętrzny (rebinding); adresy IP wprost przed połączeniem. Limit czasu, rozmiaru i przekierowań.

const MAX_BYTES = 1024 * 1024
const TIMEOUT_MS = 6000
const MAX_REDIRECTS = 3
const USER_AGENT = 'Mozilla/5.0 (compatible; Planer/1.0; +https://planer.wiergowsky.com)'

export function isPublicAddress(address: string): boolean {
  try {
    let ip = ipaddr.parse(address)
    if (ip.kind() === 'ipv6' && (ip as ipaddr.IPv6).isIPv4MappedAddress())
      ip = (ip as ipaddr.IPv6).toIPv4Address()
    return ip.range() === 'unicast'
  } catch {
    return false
  }
}

const guardedLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error, '', 0)
    const list = addresses as unknown as LookupAddress[]
    const blocked = list.find((a) => !isPublicAddress(a.address))
    if (!list.length || blocked) {
      return callback(
        Object.assign(new Error(`adres niedozwolony: ${hostname}`), { code: 'EBLOCKED' }),
        '',
        0,
      )
    }
    if (options.all) return callback(null, list as never)
    const first = list[0] as LookupAddress
    callback(null, first.address, first.family)
  })
}

export type FetchedPage = { url: string; html: string }

function requestOnce(
  url: URL,
): Promise<{ status: number; location?: string; type?: string; body?: string }> {
  return new Promise((resolve, reject) => {
    const client = url.protocol === 'https:' ? https : http
    const req = client.get(
      url,
      {
        lookup: guardedLookup,
        timeout: TIMEOUT_MS,
        headers: {
          'user-agent': USER_AGENT,
          accept: 'text/html,application/xhtml+xml',
          'accept-language': 'pl,en;q=0.8',
        },
      },
      (res) => {
        const status = res.statusCode ?? 0
        const type = res.headers['content-type']
        if (status >= 300 && status < 400) {
          res.resume()
          return resolve({ status, location: res.headers.location })
        }
        if (!type?.includes('html')) {
          res.destroy()
          return resolve({ status, type })
        }
        const chunks: Buffer[] = []
        let size = 0
        res.on('data', (chunk: Buffer) => {
          size += chunk.length
          if (size > MAX_BYTES) {
            res.destroy()
            return
          }
          chunks.push(chunk)
        })
        res.on('close', () => {
          const charset = /charset=([^;]+)/i.exec(type)?.[1]?.trim() ?? 'utf-8'
          let body: string
          try {
            body = new TextDecoder(charset).decode(Buffer.concat(chunks))
          } catch {
            body = Buffer.concat(chunks).toString('utf8')
          }
          resolve({ status, type, body })
        })
        res.on('error', reject)
      },
    )
    req.on('timeout', () => req.destroy(new Error('przekroczony czas')))
    req.on('error', reject)
  })
}

/** HTML strony spod adresu użytkownika albo null (zły adres, prywatna sieć, nie-HTML, błąd). */
export async function fetchPublicHtml(raw: string): Promise<FetchedPage | null> {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    if (url.username || url.password) return null
    // Adres IP wprost w URL omija lookup gniazda — sprawdzamy go tutaj.
    const host = url.hostname.replace(/^\[|\]$/g, '')
    if (isIP(host) && !isPublicAddress(host)) return null
    const res = await requestOnce(url).catch(() => null)
    if (!res) return null
    if (res.location) {
      url = new URL(res.location, url)
      continue
    }
    if (res.status !== 200 || res.body === undefined) return null
    return { url: url.href, html: res.body }
  }
  return null
}

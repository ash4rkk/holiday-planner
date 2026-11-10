import { describe, expect, it } from 'vitest'
import { isAppOrigin, isPublicPath } from './access'

const prod = { NODE_ENV: 'production' } as NodeJS.ProcessEnv

describe('isAppOrigin', () => {
  it('przepuszcza adres aplikacji i klientów bez Origin', () => {
    expect(isAppOrigin('https://planer.wiergowsky.com', prod)).toBe(true)
    expect(isAppOrigin(null, prod)).toBe(true)
  })

  it('odrzuca inne strony, także z tej samej domeny nadrzędnej', () => {
    expect(isAppOrigin('https://portfolio.wiergowsky.com', prod)).toBe(false)
    expect(isAppOrigin('http://planer.wiergowsky.com', prod)).toBe(false)
    expect(isAppOrigin('https://evil.example', prod)).toBe(false)
  })

  it('APP_ORIGIN zastępuje domyślny adres, w dev bez sprawdzania', () => {
    expect(isAppOrigin('https://x.test', { ...prod, APP_ORIGIN: 'https://x.test' })).toBe(true)
    expect(
      isAppOrigin('http://192.168.1.5:3000', { NODE_ENV: 'development' } as NodeJS.ProcessEnv),
    ).toBe(true)
  })
})

describe('isPublicPath', () => {
  it('przepuszcza tylko ścieżki bez danych i link dla rodziny', () => {
    for (const p of [
      '/api/health',
      '/p/abc',
      '/manifest.webmanifest',
      '/icons/192.png',
      '/offline',
    ])
      expect(isPublicPath(p)).toBe(true)
  })

  it('reszta wymaga logowania, także adresy podobne do publicznych', () => {
    for (const p of [
      '/',
      '/trips',
      '/p',
      '/packing',
      '/offline-x',
      '/api/health/x',
      '/api/ai/chat',
    ])
      expect(isPublicPath(p)).toBe(false)
  })
})

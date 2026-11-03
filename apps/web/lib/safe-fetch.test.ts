import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
const { fetchPublicHtml, isPublicAddress } = await import('./safe-fetch')

describe('isPublicAddress', () => {
  it.each([
    ['8.8.8.8', true],
    ['2a00:1450:4001:80b::200e', true],
    ['127.0.0.1', false],
    ['10.0.0.5', false],
    ['172.18.0.2', false], // sieć dockera edge (postgres)
    ['192.168.1.1', false],
    ['169.254.169.254', false], // metadane chmury
    ['100.64.0.1', false],
    ['0.0.0.0', false],
    ['::1', false],
    ['fd00::1', false],
    ['::ffff:127.0.0.1', false],
    ['nie-ip', false],
  ])('%s → %s', (ip, ok) => expect(isPublicAddress(ip)).toBe(ok))
})

describe('fetchPublicHtml', () => {
  it('odrzuca adresy wewnętrzne i inne schematy bez łączenia się', async () => {
    expect(await fetchPublicHtml('http://localhost:3000/')).toBeNull()
    expect(await fetchPublicHtml('http://127.0.0.1:5432/')).toBeNull()
    expect(await fetchPublicHtml('http://[::1]/')).toBeNull()
    expect(await fetchPublicHtml('file:///etc/passwd')).toBeNull()
    expect(await fetchPublicHtml('http://user:pass@example.com/')).toBeNull()
  })

  it('adres IP wprost (omija lookup) — odrzucony bez próby połączenia', async () => {
    const started = Date.now()
    for (const url of [
      'http://10.255.255.1/',
      'http://172.18.0.2:5432/',
      'http://169.254.169.254/latest/meta-data',
      'http://[fd00::1]/',
    ]) {
      expect(await fetchPublicHtml(url)).toBeNull()
    }
    // Nieosiągalne adresy prywatne zawiesiłyby połączenie na sekundy — tu odpowiedź jest natychmiast.
    expect(Date.now() - started).toBeLessThan(200)
  })
})

import { describe, expect, it } from 'vitest'
import { isPushEndpoint } from './push-endpoint'

describe('isPushEndpoint', () => {
  it.each([
    ['https://fcm.googleapis.com/fcm/send/abc', true],
    ['https://updates.push.services.mozilla.com/wpush/v2/abc', true],
    ['https://web.push.apple.com/abc', true],
    ['https://wns2-par02p.notify.windows.com/w/?token=abc', true],
    ['http://fcm.googleapis.com/fcm/send/abc', false],
    ['https://fcm.googleapis.com:8443/fcm/send/abc', false],
    ['https://fcm.googleapis.com.evil.com/x', false],
    ['http://postgres:5432/x', false],
    ['https://127.0.0.1/x', false],
    ['nie adres', false],
  ])('%s → %s', (url, ok) => expect(isPushEndpoint(url)).toBe(ok))
})

// Serwer wysyła POST pod endpoint subskrypcji, więc wolno tylko do usług push przeglądarek
// (bez tego zalogowana sesja mogłaby skierować serwer pod adres wewnętrzny).
const PUSH_HOST =
  /^(?:fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)$/i

export function isPushEndpoint(raw: string): boolean {
  try {
    const url = new URL(raw)
    return (
      url.protocol === 'https:' &&
      !url.port &&
      !url.username &&
      !url.password &&
      PUSH_HOST.test(url.hostname)
    )
  } catch {
    return false
  }
}

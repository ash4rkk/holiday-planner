import { getRates } from '@planer/core/fx'

/** Kursy NBP: ?q=EUR:2027-07-14,CHF:2027-07-15 → { rates: { "EUR|2027-07-14": 4.31, … } }. */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get('q') ?? ''
  const requests = q
    .split(',')
    .slice(0, 200)
    .map((pair) => pair.split(':'))
    .filter(
      (p): p is [string, string] =>
        p.length === 2 && /^[A-Z]{3}$/i.test(p[0] ?? '') && /^\d{4}-\d{2}-\d{2}$/.test(p[1] ?? ''),
    )
    .map(([currency, date]) => ({ currency: currency.toUpperCase(), date }))
  // „Dziś” w Polsce (kalendarz NBP), niezależnie od strefy serwera.
  const today = Temporal.Now.plainDateISO('Europe/Warsaw').toString()
  const rates = await getRates(requests, today)
  return Response.json({ rates, today }, { headers: { 'cache-control': 'private, max-age=600' } })
}

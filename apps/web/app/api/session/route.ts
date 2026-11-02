import { headers } from 'next/headers'
import { USER_EMAIL_HEADER } from '@/lib/auth/access'

export const dynamic = 'force-dynamic'

/** Sprawdzenie sesji z klienta: za proxy (JWT Access), więc wygasła sesja = przekierowanie lub 401. */
export async function GET() {
  const email = (await headers()).get(USER_EMAIL_HEADER)
  return Response.json({ email }, { headers: { 'cache-control': 'no-store' } })
}

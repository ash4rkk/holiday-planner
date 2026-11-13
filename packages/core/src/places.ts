import { eq, getDb, placesUsage, sql } from './db'

// Licznik zapytań do Google Places (tylko serwer). Google nie ma twardego limitu kwoty, więc
// pilnuje go aplikacja: Place Details Essentials ma 10 000 darmowych zapytań miesięcznie, a my
// zatrzymujemy się wcześniej. Text Search (samo ID miejsca) jest darmowy bez limitu.

export const PLACES_MONTHLY_LIMIT = 9000

/** Miesiąc w strefie Europe/Warsaw (YYYY-MM) — jak licznik tras; bez Temporal, bo to wystarczy. */
function month(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Warsaw',
    year: 'numeric',
    month: '2-digit',
  }).format(now)
}

export async function placesUsedThisMonth(): Promise<number> {
  const [row] = await getDb()
    .select({ requests: placesUsage.requests })
    .from(placesUsage)
    .where(eq(placesUsage.month, month()))
  return row?.requests ?? 0
}

/** Rezerwuje zapytanie o szczegóły miejsca; false = limit miesiąca wyczerpany. Atomowe. */
export async function takePlacesRequest(): Promise<boolean> {
  const rows = await getDb()
    .insert(placesUsage)
    .values({ month: month(), requests: 1 })
    .onConflictDoUpdate({
      target: placesUsage.month,
      set: { requests: sql`${placesUsage.requests} + 1` },
      setWhere: sql`${placesUsage.requests} < ${PLACES_MONTHLY_LIMIT}`,
    })
    .returning({ requests: placesUsage.requests })
  return rows.length > 0
}

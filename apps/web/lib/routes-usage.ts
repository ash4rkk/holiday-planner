import 'server-only'
import { routesMonthlyLimit } from '@planer/core'
import { eq, getDb, routesUsage, sql } from '@planer/core/db'

const month = () => Temporal.Now.plainDateISO('Europe/Warsaw').toPlainYearMonth().toString()

export const ROUTES_BUDGET_PLN = Number(process.env.GOOGLE_ROUTES_MONTHLY_BUDGET_PLN || 0)
export const ROUTES_MONTHLY_LIMIT = routesMonthlyLimit(ROUTES_BUDGET_PLN)

export async function routesUsedThisMonth(): Promise<number> {
  const [row] = await getDb()
    .select({ requests: routesUsage.requests })
    .from(routesUsage)
    .where(eq(routesUsage.month, month()))
  return row?.requests ?? 0
}

/** Rezerwuje jedno zapytanie w tym miesiącu; false = limit wyczerpany. Atomowe, więc też przy równoległych. */
export async function takeRouteRequest(): Promise<boolean> {
  const rows = await getDb()
    .insert(routesUsage)
    .values({ month: month(), requests: 1 })
    .onConflictDoUpdate({
      target: routesUsage.month,
      set: { requests: sql`${routesUsage.requests} + 1` },
      setWhere: sql`${routesUsage.requests} < ${ROUTES_MONTHLY_LIMIT}`,
    })
    .returning({ requests: routesUsage.requests })
  return rows.length > 0
}

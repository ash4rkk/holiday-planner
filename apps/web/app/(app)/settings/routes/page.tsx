import { formatAmount } from '@planer/core'
import { PLACES_MONTHLY_LIMIT, placesUsedThisMonth } from '@planer/core/places'
import { routesBudgetPln, routesLimit, routesUsedThisMonth } from '@planer/core/routes'
import { MapPin, Route } from 'lucide-react'
import { connection } from 'next/server'
import { SETTINGS_BACK } from '@/components/settings/settings-row'
import { TopBar } from '@/components/top-bar'

// Ustawienia czytają bazę przy każdym wejściu — wejście może chwilę poczekać (bez szkieletu).
export const instant = false

export default async function RoutesSettingsPage() {
  await connection()
  const routes = Boolean(process.env.GOOGLE_ROUTES_API_KEY)
  const [checks, places] = routes
    ? await Promise.all([
        routesUsedThisMonth().catch(() => 0),
        placesUsedThisMonth().catch(() => 0),
      ])
    : [0, 0]
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-1">
      <TopBar title="trasy i miejsca Google" back={SETTINGS_BACK} />
      <section className="island flex items-start gap-3 p-4 text-sm">
        <Route className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-bold">dojazdy komunikacją</p>
          {routes ? (
            <>
              <p className="mt-1">
                w tym miesiącu: <b>{checks}</b> z {routesLimit()} sprawdzeń
              </p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-raised" aria-hidden="true">
                <div
                  className="h-full bg-accent"
                  style={{ width: `${Math.min(100, (checks / routesLimit()) * 100)}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-subtle">
                limit kwoty {formatAmount({ value: routesBudgetPln(), currency: 'PLN' })} · po jego
                wyczerpaniu sprawdzanie wyłącza się do końca miesiąca
              </p>
            </>
          ) : (
            <p className="mt-1 text-muted">● brak klucza GOOGLE_ROUTES_API_KEY na serwerze</p>
          )}
        </div>
      </section>
      {routes && (
        <section className="island flex items-start gap-3 p-4 text-sm">
          <MapPin className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="font-bold">miejsca bez pinezki</p>
            <p className="mt-1">
              w tym miesiącu: <b>{places}</b> z {PLACES_MONTHLY_LIMIT} wyszukań
            </p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-raised" aria-hidden="true">
              <div
                className="h-full bg-accent"
                style={{ width: `${Math.min(100, (places / PLACES_MONTHLY_LIMIT) * 100)}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-subtle">
              w darmowej puli Google · po wyczerpaniu miejsca szuka AI do końca miesiąca
            </p>
          </div>
        </section>
      )}
    </main>
  )
}

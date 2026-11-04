import { formatAmount } from '@planer/core'
import { routesBudgetPln, routesLimit, routesUsedThisMonth } from '@planer/core/routes'
import { Route, Sparkles } from 'lucide-react'
import { PushSettings } from '@/components/settings/push-settings'
import { TopBar } from '@/components/top-bar'
import { MONTHLY_BUDGET_PLN, spentThisMonthPln } from '@/lib/ai/budget'
import { AI_MODEL, aiConfigured } from '@/lib/ai/client'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const spent = await spentThisMonthPln().catch(() => 0)
  const routes = Boolean(process.env.GOOGLE_ROUTES_API_KEY)
  const checks = routes ? await routesUsedThisMonth().catch(() => 0) : 0
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-1">
      <TopBar title="ustawienia" back={{ href: '/trips', label: 'wróć do wyjazdów' }} />
      <PushSettings publicKey={process.env.VAPID_PUBLIC_KEY} />
      <section className="island flex items-start gap-3 p-4 text-sm">
        <Sparkles className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden="true" />
        <div>
          <p className="font-bold">AI: czat i import zdjęć</p>
          {aiConfigured() ? (
            <>
              <p className="mt-1">
                w tym miesiącu:{' '}
                <b>{formatAmount({ value: Math.round(spent * 100) / 100, currency: 'PLN' })}</b> z{' '}
                {formatAmount({ value: MONTHLY_BUDGET_PLN, currency: 'PLN' })}
              </p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-raised" aria-hidden="true">
                <div
                  className="h-full bg-accent"
                  style={{ width: `${Math.min(100, (spent / MONTHLY_BUDGET_PLN) * 100)}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-subtle italic">
                model {AI_MODEL} · po przekroczeniu limitu AI wyłącza się do końca miesiąca
              </p>
            </>
          ) : (
            <p className="mt-1 text-muted">● brak klucza ANTHROPIC_API_KEY na serwerze</p>
          )}
        </div>
      </section>
      {routes && (
        <section className="island flex items-start gap-3 p-4 text-sm">
          <Route className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="font-bold">dojazdy komunikacją</p>
            <p className="mt-1">
              w tym miesiącu: <b>{checks}</b> z {routesLimit()} sprawdzeń
            </p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-raised" aria-hidden="true">
              <div
                className="h-full bg-accent"
                style={{ width: `${Math.min(100, (checks / routesLimit()) * 100)}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-subtle italic">
              limit kwoty {formatAmount({ value: routesBudgetPln(), currency: 'PLN' })} · po jego
              wyczerpaniu sprawdzanie wyłącza się do końca miesiąca
            </p>
          </div>
        </section>
      )}
      <p className="px-3 pt-2 text-xs text-subtle italic">
        Powiadomienia działają w zainstalowanej aplikacji (Chrome → „Zainstaluj aplikację”). Godzina
        przypomnienia liczy się w strefie czasowej wyjazdu (ustawienia wyjazdu).
      </p>
    </main>
  )
}

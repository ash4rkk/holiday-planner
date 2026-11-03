import { formatAmount } from '@planer/core'
import { Sparkles } from 'lucide-react'
import { PushSettings } from '@/components/settings/push-settings'
import { TopBar } from '@/components/top-bar'
import { MONTHLY_BUDGET_PLN, spentThisMonthPln } from '@/lib/ai/budget'
import { AI_MODEL, aiConfigured } from '@/lib/ai/client'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const spent = await spentThisMonthPln().catch(() => 0)
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-1">
      <TopBar title="ustawienia" back={{ href: '/', label: 'wróć do pulpitu' }} />
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
      <p className="px-3 pt-2 text-xs text-subtle italic">
        Powiadomienia działają w zainstalowanej aplikacji (Chrome → „Zainstaluj aplikację”). Godzina
        przypomnienia liczy się w strefie czasowej wyjazdu (ustawienia wyjazdu).
      </p>
    </main>
  )
}

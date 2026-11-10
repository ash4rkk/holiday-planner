import { formatAmount } from '@planer/core'
import { Sparkles } from 'lucide-react'
import { connection } from 'next/server'
import { SETTINGS_BACK } from '@/components/settings/settings-row'
import { TopBar } from '@/components/top-bar'
import { MONTHLY_BUDGET_PLN, spentThisMonthPln } from '@/lib/ai/budget'
import { AI_MODEL, aiConfigured } from '@/lib/ai/client'

// Ustawienia czytają bazę przy każdym wejściu — wejście może chwilę poczekać (bez szkieletu).
export const instant = false

export default async function AiSettingsPage() {
  await connection()
  const spent = await spentThisMonthPln().catch(() => 0)
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-1">
      <TopBar title="AI" back={SETTINGS_BACK} />
      <section className="island flex items-start gap-3 p-4 text-sm">
        <Sparkles className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-bold">czat i import zdjęć</p>
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
              <p className="mt-2 text-xs text-subtle">
                model {AI_MODEL} · po przekroczeniu limitu AI wyłącza się do końca miesiąca
              </p>
            </>
          ) : (
            <p className="mt-1 text-muted">● brak klucza ANTHROPIC_API_KEY na serwerze</p>
          )}
        </div>
      </section>
    </main>
  )
}

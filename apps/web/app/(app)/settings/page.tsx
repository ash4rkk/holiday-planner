import { DEFAULT_BRIEFING, DEFAULT_PACKING_DAYS, formatAmount } from '@planer/core'
import { recentEvents } from '@planer/core/events'
import type { ReminderDefaults } from '@planer/core/reminders'
import { routesLimit, routesUsedThisMonth } from '@planer/core/routes'
import { getBriefingSettings, getPackingDays, getReminderDefaults } from '@planer/core/settings'
import { Bell, Clock, Link2, Route, ScrollText, Sparkles, SunMoon } from 'lucide-react'
import Link from 'next/link'
import { connection } from 'next/server'
import { ProfilePhoto } from '@/components/profile/profile-photo'
import { PushValue } from '@/components/settings/push-value'
import { SettingsGroup, SettingsRow } from '@/components/settings/settings-row'
import { SyncStatus } from '@/components/settings/sync-status'
import { ThemeValue } from '@/components/settings/theme-value'
import { TopBar } from '@/components/top-bar'
import { MONTHLY_BUDGET_PLN, spentThisMonthPln } from '@/lib/ai/budget'
import { aiConfigured } from '@/lib/ai/client'
import { getCurrentUser } from '@/lib/auth/user'
import { appSettingsBack } from '@/lib/back'
import { formatLead } from '@/lib/format-remind'
import { activeFamilyLinks } from '@/lib/settings-data'

// Ustawienia czytają bazę przy każdym wejściu — wejście może chwilę poczekać (bez szkieletu).
export const instant = false

export default async function SettingsPage({ searchParams }: PageProps<'/settings'>) {
  await connection()
  const { from } = await searchParams
  const routes = Boolean(process.env.GOOGLE_ROUTES_API_KEY)
  const [user, spent, checks, defaults, links, events, briefing, packingDays] = await Promise.all([
    getCurrentUser(),
    spentThisMonthPln().catch(() => 0),
    routes ? routesUsedThisMonth().catch(() => 0) : 0,
    getReminderDefaults().catch((): ReminderDefaults => ({})),
    activeFamilyLinks().catch(() => []),
    recentEvents(7 * 24).catch(() => []),
    getBriefingSettings().catch(() => DEFAULT_BRIEFING),
    getPackingDays().catch(() => DEFAULT_PACKING_DAYS),
  ])
  const dayAgo = Date.now() - 24 * 3_600_000
  const problems = events.filter((e) => e.level !== 'ok' && e.at.getTime() > dayAgo)
  const weekProblems = events.filter((e) => e.level !== 'ok').length

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-1">
      <TopBar title="ustawienia" back={appSettingsBack(from)} />

      <section className="island flex items-center gap-3 p-3" aria-label="profil">
        <ProfilePhoto
          name={user.name}
          className="size-11 shrink-0 overflow-hidden rounded-full border border-line"
        />
        <div className="min-w-0 flex-1">
          <p className="font-bold">{user.name}</p>
          <SyncStatus />
        </div>
      </section>

      {problems.length > 0 && (
        <Link href="/settings/logs" className="island border-amber p-3 text-sm hover:border-accent">
          <span className="block font-bold text-amber">
            ● {problems.length === 1 ? '1 problem' : `${problems.length} problemy`} z ostatniej doby
          </span>
          <span className="block truncate text-xs text-subtle">
            {problems
              .slice(0, 2)
              .map((e) => e.message)
              .join(' · ')}
          </span>
        </Link>
      )}

      <SettingsGroup label="wygląd">
        <SettingsRow href="/settings/theme" label="motyw" icon={SunMoon} value={<ThemeValue />} />
      </SettingsGroup>

      <SettingsGroup label="w podróży">
        <SettingsRow
          href="/settings/notifications"
          label="powiadomienia"
          icon={Bell}
          value={<PushValue />}
        />
        <SettingsRow
          href="/settings/reminders"
          label="przypomnienia"
          icon={Clock}
          value={[
            defaults.transport ? `transport ${formatLead(defaults.transport)}` : 'bez przypomnień',
            briefing.enabled && `podsumowanie ${briefing.time}`,
            packingDays > 0 && `pakowanie ${packingDays} ${packingDays === 1 ? 'dzień' : 'dni'}`,
          ]
            .filter(Boolean)
            .join(' · ')}
        />
      </SettingsGroup>

      <SettingsGroup label="udostępnianie">
        <SettingsRow
          href="/settings/links"
          label="linki dla rodziny"
          icon={Link2}
          value={links.length ? `${links.length} aktywne` : 'brak'}
        />
      </SettingsGroup>

      <SettingsGroup label="system">
        <SettingsRow
          href="/settings/ai"
          label="AI"
          icon={Sparkles}
          warn={!aiConfigured()}
          value={
            aiConfigured()
              ? `${formatAmount({ value: Math.round(spent), currency: 'PLN' })} / ${formatAmount({ value: MONTHLY_BUDGET_PLN, currency: 'PLN' })}`
              : 'brak klucza'
          }
        />
        {routes && (
          <SettingsRow
            href="/settings/routes"
            label="trasy Google"
            icon={Route}
            value={`${checks} / ${routesLimit()}`}
          />
        )}
        <SettingsRow
          href="/settings/logs"
          label="logi i problemy"
          icon={ScrollText}
          value={weekProblems ? `${weekProblems} w tygodniu` : 'bez problemów'}
        />
      </SettingsGroup>
    </main>
  )
}

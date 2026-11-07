import { formatAmount } from '@planer/core'
import { recentEvents } from '@planer/core/events'
import type { ReminderDefaults } from '@planer/core/reminders'
import { routesLimit, routesUsedThisMonth } from '@planer/core/routes'
import { getReminderDefaults } from '@planer/core/settings'
import Link from 'next/link'
import { ProfilePhoto } from '@/components/profile/profile-photo'
import { PushValue } from '@/components/settings/push-value'
import { SettingsGroup, SettingsRow } from '@/components/settings/settings-row'
import { SyncStatus } from '@/components/settings/sync-status'
import { ThemeValue } from '@/components/settings/theme-value'
import { TopBar } from '@/components/top-bar'
import { MONTHLY_BUDGET_PLN, spentThisMonthPln } from '@/lib/ai/budget'
import { aiConfigured } from '@/lib/ai/client'
import { getCurrentUser } from '@/lib/auth/user'
import { formatLead } from '@/lib/format-remind'
import { activeFamilyLinks } from '@/lib/settings-data'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const routes = Boolean(process.env.GOOGLE_ROUTES_API_KEY)
  const [user, spent, checks, defaults, links, events] = await Promise.all([
    getCurrentUser(),
    spentThisMonthPln().catch(() => 0),
    routes ? routesUsedThisMonth().catch(() => 0) : 0,
    getReminderDefaults().catch((): ReminderDefaults => ({})),
    activeFamilyLinks().catch(() => []),
    recentEvents(7 * 24).catch(() => []),
  ])
  const dayAgo = Date.now() - 24 * 3_600_000
  const problems = events.filter((e) => e.level !== 'ok' && e.at.getTime() > dayAgo)
  const weekProblems = events.filter((e) => e.level !== 'ok').length

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-1">
      <TopBar title="ustawienia" back={{ href: '/trips', label: 'wróć do wyjazdów' }} />

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

      <SettingsGroup>
        <SettingsRow href="/settings/theme" label="motyw" value={<ThemeValue />} />
        <SettingsRow href="/settings/notifications" label="powiadomienia" value={<PushValue />} />
        <SettingsRow
          href="/settings/reminders"
          label="przypomnienia"
          value={defaults.transport ? `transport ${formatLead(defaults.transport)}` : 'wyłączone'}
        />
      </SettingsGroup>

      <SettingsGroup>
        <SettingsRow
          href="/settings/links"
          label="linki dla rodziny"
          value={links.length ? `${links.length} aktywne` : 'brak'}
        />
        <SettingsRow
          href="/settings/logs"
          label="logi i problemy"
          value={weekProblems ? `${weekProblems} w tygodniu` : 'bez problemów'}
        />
      </SettingsGroup>

      <SettingsGroup>
        <SettingsRow
          href="/settings/ai"
          label="AI"
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
            value={`${checks} / ${routesLimit()}`}
          />
        )}
      </SettingsGroup>
    </main>
  )
}

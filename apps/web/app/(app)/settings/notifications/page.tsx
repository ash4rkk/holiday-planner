import { PushSettings } from '@/components/settings/push-settings'
import { SETTINGS_BACK } from '@/components/settings/settings-row'
import { TopBar } from '@/components/top-bar'

export default function NotificationsPage() {
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-1">
      <TopBar title="powiadomienia" back={SETTINGS_BACK} />
      <PushSettings publicKey={process.env.VAPID_PUBLIC_KEY} />
      <p className="px-3 pt-2 text-xs text-subtle italic">
        Powiadomienia działają w zainstalowanej aplikacji (Chrome → „Zainstaluj aplikację”). Godzina
        przypomnienia liczy się w strefie czasowej wyjazdu (ustawienia wyjazdu).
      </p>
    </main>
  )
}

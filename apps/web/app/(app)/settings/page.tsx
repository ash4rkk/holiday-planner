import { PushSettings } from '@/components/settings/push-settings'
import { TopBar } from '@/components/top-bar'

export default function SettingsPage() {
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-1">
      <TopBar title="ustawienia" back={{ href: '/', label: 'wróć do pulpitu' }} />
      <PushSettings publicKey={process.env.VAPID_PUBLIC_KEY} />
      <p className="px-3 pt-2 text-xs text-subtle italic">
        Powiadomienia działają w zainstalowanej aplikacji (Chrome → „Zainstaluj aplikację”). Godzina
        przypomnienia liczy się w strefie czasowej wyjazdu (ustawienia wyjazdu).
      </p>
    </main>
  )
}

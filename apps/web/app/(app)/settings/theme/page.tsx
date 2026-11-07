import { SETTINGS_BACK } from '@/components/settings/settings-row'
import { ThemeSettings } from '@/components/settings/theme-settings'
import { TopBar } from '@/components/top-bar'

export default function ThemePage() {
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-1">
      <TopBar title="motyw" back={SETTINGS_BACK} />
      <ThemeSettings />
    </main>
  )
}

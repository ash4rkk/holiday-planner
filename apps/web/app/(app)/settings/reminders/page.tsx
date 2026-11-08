import { CARD_TYPE_LABELS, CARD_TYPES, type CardType } from '@planer/core'
import { getReminderDefaults } from '@planer/core/settings'
import { connection } from 'next/server'
import { SETTINGS_BACK } from '@/components/settings/settings-row'
import { TopBar } from '@/components/top-bar'
import { buttonClass, inputClass } from '@/components/ui'
import { formatLead } from '@/lib/format-remind'
import { saveReminderDefaults } from '../actions'

const OPTIONS = [0, 15, 30, 60, 120, 180, 360, 720, 1440]

export default async function RemindersPage() {
  await connection()
  const defaults = await getReminderDefaults()
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-1">
      <TopBar title="przypomnienia" back={SETTINGS_BACK} />
      <form action={saveReminderDefaults} className="island flex flex-col gap-3 p-4 text-sm">
        <p className="text-xs text-subtle italic">
          ile przed godziną karty przychodzi powiadomienie — dla kart z datą i godziną
        </p>
        {(CARD_TYPES as readonly CardType[]).map((type) => (
          <label key={type} className="grid grid-cols-[1fr_9rem] items-center gap-3">
            <span>{CARD_TYPE_LABELS[type]}</span>
            <select name={type} defaultValue={defaults[type] ?? 0} className={inputClass}>
              {[...new Set([...OPTIONS, defaults[type] ?? 0])]
                .sort((a, b) => a - b)
                .map((min) => (
                  <option key={min} value={min}>
                    {min ? `${formatLead(min)} przed` : 'brak'}
                  </option>
                ))}
            </select>
          </label>
        ))}
        <button type="submit" className={buttonClass('primary')}>
          zapisz
        </button>
      </form>
      <p className="px-3 pt-2 text-xs text-subtle italic">
        Wspólne dla obu osób. Karty z własnym przypomnieniem (ustawionym w karcie) zostają bez
        zmian.
      </p>
    </main>
  )
}

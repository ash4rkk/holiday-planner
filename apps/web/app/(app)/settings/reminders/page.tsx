import { CARD_TYPE_LABELS, CARD_TYPES, type CardType, MAX_PACKING_DAYS } from '@planer/core'
import { getBriefingSettings, getPackingDays, getReminderDefaults } from '@planer/core/settings'
import { connection } from 'next/server'
import { SETTINGS_BACK } from '@/components/settings/settings-row'
import { TopBar } from '@/components/top-bar'
import { buttonClass, inputClass } from '@/components/ui'
import { formatLead } from '@/lib/format-remind'
import { saveBriefing, savePackingDays, saveReminderDefaults } from '../actions'

// Ustawienia czytają bazę przy każdym wejściu — wejście może chwilę poczekać (bez szkieletu).
export const instant = false

const daysWord = (d: number) => (d === 1 ? 'dzień' : 'dni')

const OPTIONS = [0, 15, 30, 60, 120, 180, 360, 720, 1440]

export default async function RemindersPage() {
  await connection()
  const [defaults, briefing, packingDays] = await Promise.all([
    getReminderDefaults(),
    getBriefingSettings(),
    getPackingDays(),
  ])
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-1">
      <TopBar title="przypomnienia" back={SETTINGS_BACK} />
      <form action={saveReminderDefaults} className="island flex flex-col gap-3 p-4 text-sm">
        <p className="text-xs text-subtle">
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
      <form action={saveBriefing} className="island mt-1 flex flex-col gap-3 p-4 text-sm">
        <p className="font-bold">podsumowanie na jutro</p>
        <p className="text-xs text-subtle">
          wieczorem push z pierwszą kartą i godziną wyjścia, biletami, rezerwacjami i pogodą — od
          dnia przed wyjazdem, w strefie czasowej wyjazdu
        </p>
        <label className="flex min-h-11 items-center gap-3">
          <input
            type="checkbox"
            name="enabled"
            defaultChecked={briefing.enabled}
            className="size-5 accent-(--accent)"
          />
          wysyłaj podsumowanie
        </label>
        <label className="grid grid-cols-[1fr_9rem] items-center gap-3">
          <span>godzina</span>
          <input type="time" name="time" defaultValue={briefing.time} className={inputClass} />
        </label>
        <button type="submit" className={buttonClass('primary')}>
          zapisz
        </button>
      </form>
      <form action={savePackingDays} className="island mt-1 flex flex-col gap-3 p-4 text-sm">
        <p className="font-bold">lista pakowania</p>
        <p className="text-xs text-subtle">
          od kiedy „dziś” pokazuje pasek „spakowane … z …” — w pierwszym dniu wyjazdu znika
        </p>
        <label className="grid grid-cols-[1fr_9rem] items-center gap-3">
          <span>pokazuj w „dziś”</span>
          <select name="days" defaultValue={packingDays} className={inputClass}>
            {Array.from({ length: MAX_PACKING_DAYS + 1 }, (_, d) => (
              <option key={d} value={d}>
                {d === 0 ? 'nie pokazuj' : `${d} ${daysWord(d)} przed`}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className={buttonClass('primary')}>
          zapisz
        </button>
      </form>
      <p className="px-3 pt-2 text-xs text-subtle">
        Wspólne dla obu osób. Karty z własnym przypomnieniem (ustawionym w karcie) zostają bez
        zmian.
      </p>
    </main>
  )
}

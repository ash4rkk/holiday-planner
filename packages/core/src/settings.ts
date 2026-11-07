import type { CardType } from './cards'
import { appSettings, eq, getDb } from './db'
import { DEFAULT_REMIND_MIN, type ReminderDefaults } from './reminders'

// Wspólne ustawienia aplikacji w bazie (dla obu osób). Tylko po stronie serwera.

const REMINDERS_KEY = 'reminders'
const CACHE_MS = 30_000
let cached: { at: number; value: ReminderDefaults } | undefined

/** Domyślne wyprzedzenie przypomnień wg typu karty; brak typu = bez przypomnienia. */
export async function getReminderDefaults(): Promise<ReminderDefaults> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value
  const [row] = await getDb()
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, REMINDERS_KEY))
  const value = (row?.value as ReminderDefaults | undefined) ?? DEFAULT_REMIND_MIN
  cached = { at: Date.now(), value }
  return value
}

export async function setReminderDefaults(value: ReminderDefaults): Promise<void> {
  const clean: ReminderDefaults = {}
  for (const [type, min] of Object.entries(value) as [CardType, number | undefined][]) {
    if (typeof min === 'number' && min > 0) clean[type] = Math.round(min)
  }
  await getDb()
    .insert(appSettings)
    .values({ key: REMINDERS_KEY, value: clean })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: clean, updatedAt: new Date() } })
  cached = { at: Date.now(), value: clean }
}

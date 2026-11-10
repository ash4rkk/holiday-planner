import { type BriefingSettings, DEFAULT_BRIEFING } from './briefing'
import type { CardType } from './cards'
import { appSettings, eq, getDb } from './db'
import { DEFAULT_PACKING_DAYS, MAX_PACKING_DAYS } from './packing'
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

// ---------- lista pakowania ----------

const PACKING_KEY = 'packing'

/** Ile dni przed wyjazdem „dziś” pokazuje pasek listy pakowania. */
export async function getPackingDays(): Promise<number> {
  const [row] = await getDb()
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, PACKING_KEY))
  const days = (row?.value as { days?: unknown } | undefined)?.days
  return typeof days === 'number' ? days : DEFAULT_PACKING_DAYS
}

export async function setPackingDays(days: number): Promise<void> {
  const clean = { days: Math.min(MAX_PACKING_DAYS, Math.max(0, Math.round(days) || 0)) }
  await getDb()
    .insert(appSettings)
    .values({ key: PACKING_KEY, value: clean })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: clean, updatedAt: new Date() } })
}

// ---------- wieczorne podsumowanie ----------

const BRIEFING_KEY = 'briefing'
const briefingSentKey = (tripId: string) => `briefing-sent:${tripId}`

export async function getBriefingSettings(): Promise<BriefingSettings> {
  const [row] = await getDb()
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, BRIEFING_KEY))
  return { ...DEFAULT_BRIEFING, ...((row?.value as Partial<BriefingSettings>) ?? {}) }
}

export async function setBriefingSettings(value: BriefingSettings): Promise<void> {
  const clean: BriefingSettings = {
    enabled: Boolean(value.enabled),
    time: /^\d{2}:\d{2}$/.test(value.time) ? value.time : DEFAULT_BRIEFING.time,
  }
  await getDb()
    .insert(appSettings)
    .values({ key: BRIEFING_KEY, value: clean })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: clean, updatedAt: new Date() } })
}

/** Dzień (jutro), na który podsumowanie już poszło — jedno na wyjazd i dzień. */
export async function briefingSentFor(tripId: string): Promise<string | undefined> {
  const [row] = await getDb()
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, briefingSentKey(tripId)))
  return row?.value as string | undefined
}

export async function markBriefingSent(tripId: string, date: string): Promise<void> {
  await getDb()
    .insert(appSettings)
    .values({ key: briefingSentKey(tripId), value: date })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: date, updatedAt: new Date() } })
}

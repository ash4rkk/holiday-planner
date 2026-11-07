import { appEvents, desc, getDb, gte, lte } from './db'

// Dziennik zdarzeń („logi i problemy” w ustawieniach). Tylko po stronie serwera (worker, sync, API).

export type EventLevel = 'error' | 'warn' | 'ok'

// To samo zdarzenie (np. niedostępne API przy każdym zapytaniu) zapisujemy najwyżej raz na 10 min.
const REPEAT_MS = 10 * 60_000
const lastSeen = new Map<string, number>()

/** Zapis zdarzenia; błąd zapisu nie może przerwać zadania, więc tylko trafia do konsoli. */
export async function logEvent(level: EventLevel, source: string, message: string): Promise<void> {
  const log = level === 'ok' ? console.log : console.warn
  log(`[${source}] ${message}`)
  const key = `${level}|${source}|${message}`
  const seen = lastSeen.get(key)
  if (seen && Date.now() - seen < REPEAT_MS) return
  lastSeen.set(key, Date.now())
  if (lastSeen.size > 500) lastSeen.delete(lastSeen.keys().next().value as string)
  try {
    await getDb()
      .insert(appEvents)
      .values({ level, source, message: message.slice(0, 500) })
  } catch (error) {
    console.warn('[events] zapis nie powiódł się', String(error))
  }
}

/** Zdarzenia z ostatnich `hours` godzin, od najnowszych. */
export async function recentEvents(hours: number, limit = 200) {
  return getDb()
    .select()
    .from(appEvents)
    .where(gte(appEvents.at, new Date(Date.now() - hours * 3_600_000)))
    .orderBy(desc(appEvents.at))
    .limit(limit)
}

/** Usuwa wpisy starsze niż `days` dni (worker raz dziennie). */
export async function pruneEvents(days = 30): Promise<void> {
  await getDb()
    .delete(appEvents)
    .where(lte(appEvents.at, new Date(Date.now() - days * 86_400_000)))
}

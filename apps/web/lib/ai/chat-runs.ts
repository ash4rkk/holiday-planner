import 'server-only'

// Trwające odpowiedzi czatu: jedna na wyjazd. Odpowiedź nie zależy od połączenia przeglądarki —
// zamknięcie czatu jej nie przerywa, kończy się i zapisuje w tle. Przerywa tylko „stop”.
// Aplikacja chodzi w jednym procesie Node, więc wystarczy mapa w pamięci.

export type ChatRun = { controller: AbortController; userName: string; startedAt: number }

const runs = new Map<string, ChatRun>()
// Zapas na wypadek zawieszenia: po 10 min wpis nie blokuje już nowych pytań.
const STALE_MS = 10 * 60_000

export function activeRun(tripId: string): ChatRun | undefined {
  const run = runs.get(tripId)
  if (run && Date.now() - run.startedAt > STALE_MS) {
    run.controller.abort()
    runs.delete(tripId)
    return undefined
  }
  return run
}

export function startRun(tripId: string, userName: string): ChatRun {
  const run = { controller: new AbortController(), userName, startedAt: Date.now() }
  runs.set(tripId, run)
  return run
}

export function endRun(tripId: string, run: ChatRun) {
  if (runs.get(tripId) === run) runs.delete(tripId)
}

/** „Stop”: przerywa odpowiedź; to, co już przyszło, zapisuje się z dopiskiem. */
export function stopRun(tripId: string): boolean {
  const run = runs.get(tripId)
  if (!run) return false
  run.controller.abort()
  return true
}

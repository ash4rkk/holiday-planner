import { TRIPS_BACK } from '@/components/top-bar'

// Powrót z ustawień tam, skąd się przyszło (`?from=`), a nie zawsze w jedno miejsce.

const VIEWS = ['today', 'list', 'board', 'map', 'weather']
const TRIP_VIEW = /^\/trips\/[\w-]+\/(today|list|board|map|weather)$/
export const BACK_TO_TRIP = 'wróć do wyjazdu'

/** Ustawienia wyjazdu: z listy wyjazdów (`from=trips`) albo z widoku wyjazdu (`from=board`…). */
export function tripSettingsBack(tripId: string, from: unknown) {
  if (from === 'trips') return TRIPS_BACK
  const view = typeof from === 'string' && VIEWS.includes(from) ? from : 'today'
  return { href: `/trips/${tripId}/${view}`, label: BACK_TO_TRIP }
}

/** Ustawienia aplikacji: z widoku wyjazdu (pełna ścieżka) albo z listy wyjazdów. */
export function appSettingsBack(from: unknown) {
  return typeof from === 'string' && TRIP_VIEW.test(from)
    ? { href: from, label: BACK_TO_TRIP }
    : TRIPS_BACK
}

/** Ostatni człon ścieżki widoku wyjazdu (`board`), gdy to widok wyjazdu. */
export function tripView(pathname: string): string | undefined {
  const view = pathname.split('/').at(-1)
  return view && VIEWS.includes(view) ? view : undefined
}

import { addDays } from './dates'

// Wydarzenia z kalendarzy zewnętrznych (TimeTree, .ics) w planerze urlopów: już rozwinięte
// w pojedyncze wystąpienia, daty i godziny lokalne. Bez bazy — działa też w przeglądarce.

export interface EventOccurrence {
  /** uid wydarzenia + data wystąpienia (unikalne w kalendarzu) */
  uid: string
  title: string
  startDate: string
  endDate: string
  startTime: string | null
  endTime: string | null
  allDay: boolean
}

export interface DayEvent extends EventOccurrence {
  calendarId: string
}

/** Wydarzenia rozłożone na dni (wielodniowe w każdym dniu), tylko w zakresie `from`–`to`. */
export function eventsByDay<T extends EventOccurrence>(
  events: T[],
  from: string,
  to: string,
): Map<string, T[]> {
  const out = new Map<string, T[]>()
  for (const ev of events) {
    let day = ev.startDate > from ? ev.startDate : from
    const last = ev.endDate < to ? ev.endDate : to
    while (day <= last) {
      const list = out.get(day)
      if (list) list.push(ev)
      else out.set(day, [ev])
      day = addDays(day, 1)
    }
  }
  for (const list of out.values()) {
    list.sort(
      (a, b) =>
        Number(b.allDay) - Number(a.allDay) || (a.startTime ?? '').localeCompare(b.startTime ?? ''),
    )
  }
  return out
}

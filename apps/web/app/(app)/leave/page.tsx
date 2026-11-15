import { todayLocal } from '@planer/core'
import { getLeaveRegion } from '@planer/core/settings'
import { connection } from 'next/server'
import { LeavePlanner } from '@/components/leave/leave-planner'
import { isLeaveView } from '@/components/leave/model'
import { getCurrentUser } from '@/lib/auth/user'
import { listCalendarEvents, listCalendars, listLeave } from '@/lib/leave'
import { listTrips } from '@/lib/trips'

// Planer czyta bazę przy każdym wejściu — wejście może chwilę poczekać.
export const instant = false

export default async function LeavePage({ searchParams }: PageProps<'/leave'>) {
  await connection()
  const params = await searchParams
  const today = todayLocal()
  const thisYear = Number(today.slice(0, 4))
  const y = Number(params.year)
  const year = Number.isInteger(y) && y >= 2000 && y <= 2100 ? y : thisYear
  const view = isLeaveView(params.view) ? params.view : 'months'
  const m = Number(params.m)
  const month =
    Number.isInteger(m) && m >= 1 && m <= 12
      ? m - 1
      : year === thisYear
        ? Number(today.slice(5, 7)) - 1
        : 0
  const from = `${year}-01-01`
  const to = `${year}-12-31`

  const [, region, periods, lists, calendars, events] = await Promise.all([
    getCurrentUser(),
    getLeaveRegion(),
    listLeave(from, to),
    listTrips(),
    listCalendars(),
    listCalendarEvents(from, to),
  ])
  const trips = [...lists.current, ...lists.upcoming, ...lists.past, ...lists.archived]
    .filter((t) => t.startDate)
    .map((t) => ({
      id: t.id,
      title: t.title,
      startDate: t.startDate as string,
      endDate: t.endDate ?? (t.startDate as string),
    }))
    .filter((t) => t.endDate >= from && t.startDate <= to)

  return (
    <LeavePlanner
      key={year}
      year={year}
      region={region}
      initialView={view}
      initialMonth={month}
      periods={periods}
      trips={trips}
      events={events}
      calendars={calendars.map((c) => ({ id: c.id, name: c.name }))}
    />
  )
}

import { todayLocal } from '@planer/core'
import { getLeaveRegions } from '@planer/core/settings'
import { connection } from 'next/server'
import { LeavePlanner } from '@/components/leave/leave-planner'
import { isLeaveView } from '@/components/leave/model'
import { Flag } from '@/components/trips/flag'
import { getCurrentUser } from '@/lib/auth/user'
import { listCalendarEvents, listCalendars, listLeave } from '@/lib/leave'
import { listProfiles } from '@/lib/profiles'
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
  const view = isLeaveView(params.view) ? params.view : 'columns'
  const m = Number(params.m)
  const month =
    Number.isInteger(m) && m >= 1 && m <= 12
      ? m - 1
      : year === thisYear
        ? Number(today.slice(5, 7)) - 1
        : 0
  const from = `${year}-01-01`
  const to = `${year}-12-31`

  const [user, region, periods, lists, calendars, events] = await Promise.all([
    getCurrentUser(),
    getLeaveRegions(),
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
      flag: t.country ? <Flag country={t.country} className="h-full w-full" /> : undefined,
    }))
    .filter((t) => t.endDate >= from && t.startDate <= to)

  return (
    <LeavePlanner
      key={year}
      year={year}
      regions={region}
      initialView={view}
      initialMonth={month}
      periods={periods}
      trips={trips}
      events={events}
      calendars={calendars.map((c) => ({ id: c.id, name: c.name }))}
      persons={listProfiles(user.name).map((p) => p.name)}
    />
  )
}

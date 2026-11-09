import {
  addDays,
  composeBriefing,
  dayLegs,
  docFromState,
  readAttachments,
  readCards,
  shiftClock,
  TRAVEL_MODE_LABELS,
  weatherPlace,
} from '@planer/core'
import { and, eq, getDb, gte, lte, tripDocs, trips } from '@planer/core/db'
import { logEvent, pruneEvents } from '@planer/core/events'
import { dayForecast } from '@planer/core/forecast'
import { getRates } from '@planer/core/fx'
import { sendPush } from '@planer/core/push'
import { dueReminders, markReminderSent, unmarkReminderSent } from '@planer/core/reminders-db'
import { legsFromDoc, markLegAlerted, planLeg, sweepRouteCache } from '@planer/core/routes'
import { briefingSentFor, getBriefingSettings, markBriefingSent } from '@planer/core/settings'
import { nightlyBackup } from './backup'

// Zadania w tle: przypomnienia push z kart (co 30 s), odświeżanie kursów NBP (co 6 h)
// i nocna kopia bazy oraz plików (sprawdzane co 10 min, robione raz dziennie).

const REMINDERS_EVERY_MS = 30_000
const FX_EVERY_MS = 6 * 60 * 60_000
const BACKUP_CHECK_MS = 10 * 60_000
const LEAVE_CHECK_MS = 2 * 60_000
const LEAVE_LOOKAHEAD_MIN = 150
const LEAVE_NOTICE_MIN = 10
const BRIEFING_CHECK_MS = 2 * 60_000
// Po tym czasie od ustawionej godziny podsumowanie już nie idzie (np. worker stał w nocy).
const BRIEFING_LATE_MIN = 180

const toMinutes = (time: string) => {
  const [h = 0, m = 0] = time.split(':').map(Number)
  return h * 60 + m
}

/** „Czas wyjść”: świeży dojazd do następnej karty i push na chwilę przed godziną wyjścia. */
async function leaveReminders() {
  // Szerzej o dzień w obie strony, bo „dziś” liczy się w strefie wyjazdu, nie w Warszawie.
  const warsaw = Temporal.Now.plainDateISO('Europe/Warsaw').toString()
  const rows = await getDb()
    .select({ trip: trips, state: tripDocs.state })
    .from(trips)
    .innerJoin(tripDocs, eq(tripDocs.tripId, trips.id))
    .where(
      and(
        eq(trips.archived, false),
        lte(trips.startDate, addDays(warsaw, 1)),
        gte(trips.endDate, addDays(warsaw, -1)),
      ),
    )

  for (const { trip, state } of rows) {
    const now = Temporal.Now.zonedDateTimeISO(trip.timezone)
    const date = now.toPlainDate().toString()
    if (!trip.startDate || date < trip.startDate || date > (trip.endDate ?? trip.startDate))
      continue
    const clock = now.hour * 60 + now.minute
    for (const leg of legsFromDoc(state, date)) {
      if (!leg.route || !leg.arriveBy) continue
      const arrive = toMinutes(leg.arriveBy)
      if (arrive <= clock || arrive - clock > LEAVE_LOOKAHEAD_MIN) continue
      const request = {
        ...leg.route,
        date,
        leaveAt: leg.leaveAt,
        arriveBy: leg.arriveBy,
        mode: leg.mode,
      }
      const { plan } = await planLeg(request, trip)
      if (!plan) continue
      const leaveBy = shiftClock(
        plan.departAt ?? shiftClock(leg.arriveBy, -plan.minutes),
        -trip.travelBufferMin,
      )
      if (clock < toMinutes(leaveBy) - LEAVE_NOTICE_MIN) continue
      if (!(await markLegAlerted(trip.id, leg, date))) continue
      await sendPush(
        {},
        {
          title: `czas wyjść · ${leaveBy}`,
          body: `${plan.minutes} min ${TRAVEL_MODE_LABELS[plan.mode]}, na miejscu o ${leg.arriveBy}`,
          url: `/trips/${trip.id}/today`,
          tag: `leave-${leg.id}`,
        },
      )
      console.log(`worker: czas wyjść ${trip.title} ${leaveBy}`)
    }
  }
}

/**
 * Wieczorne podsumowanie na jutro: raz na wyjazd i dzień, o ustawionej godzinie w strefie wyjazdu,
 * od dnia przed wyjazdem do przedostatniego dnia.
 */
async function eveningBriefing() {
  const settings = await getBriefingSettings()
  if (!settings.enabled) return
  const rows = await getDb()
    .select({ trip: trips, state: tripDocs.state })
    .from(trips)
    .innerJoin(tripDocs, eq(tripDocs.tripId, trips.id))
    .where(eq(trips.archived, false))
  for (const { trip, state } of rows) {
    if (!trip.startDate) continue
    const now = Temporal.Now.zonedDateTimeISO(trip.timezone)
    const tomorrow = addDays(now.toPlainDate().toString(), 1)
    if (tomorrow < trip.startDate || tomorrow > (trip.endDate ?? trip.startDate)) continue
    const late = now.hour * 60 + now.minute - toMinutes(settings.time)
    if (late < 0 || late > BRIEFING_LATE_MIN) continue
    if ((await briefingSentFor(trip.id)) === tomorrow) continue
    // Najpierw znacznik: przy awarii w trakcie lepiej nie wysłać niż wysłać dwa razy.
    await markBriefingSent(trip.id, tomorrow)

    const doc = docFromState(state)
    const cards = readCards(doc)
    const start = dayLegs(cards, tomorrow).find((l) => l.kind === 'start' && l.route && l.arriveBy)
    let leaveBy: string | undefined
    if (start?.route && start.arriveBy) {
      const { plan } = await planLeg(
        { ...start.route, date: tomorrow, arriveBy: start.arriveBy, mode: start.mode },
        trip,
      ).catch(() => ({ plan: null }))
      if (plan)
        leaveBy = shiftClock(
          plan.departAt ?? shiftClock(start.arriveBy, -plan.minutes),
          -trip.travelBufferMin,
        )
    }
    const place = weatherPlace(cards, tomorrow)
    const forecast = place ? await dayForecast(place, tomorrow) : undefined
    const briefing = composeBriefing({
      date: tomorrow,
      cards,
      attachments: readAttachments(doc),
      leaveBy,
      forecast,
    })
    doc.destroy()
    if (!briefing) continue
    const { sent } = await sendPush(
      {},
      { ...briefing, url: `/trips/${trip.id}/today`, tag: `briefing-${trip.id}` },
    )
    console.log(`worker: podsumowanie ${trip.title} na ${tomorrow} → ${sent} urządz.`)
  }
}

async function sendReminders() {
  for (const r of await dueReminders()) {
    // Najpierw znacznik — przy awarii procesu w trakcie lepiej nie wysłać niż wysłać dwa razy.
    await markReminderSent(r)
    const { sent, failed } = await sendPush(
      {},
      {
        title: r.title,
        body: r.body,
        url: `/trips/${r.tripId}/list?card=${r.cardId}`,
        tag: `card-${r.cardId}`,
      },
    )
    // Nic nie doszło z powodu błędów przejściowych (sieć, serwis push) → następna próba za 30 s.
    if (!sent && failed) await unmarkReminderSent(r)
    console.log(
      `worker: przypomnienie „${r.title}” → ${sent} urządz.${failed ? `, ${failed} błędów` : ''}`,
    )
  }
}

async function refreshRates() {
  const active = await getDb()
    .select({ currencies: trips.currencies })
    .from(trips)
    .where(eq(trips.archived, false))
  const today = Temporal.Now.plainDateISO('Europe/Warsaw').toString()
  const currencies = [...new Set(active.flatMap((t) => t.currencies))]
  if (currencies.length)
    await getRates(
      currencies.map((currency) => ({ currency, date: today })),
      today,
    )
}

function every(ms: number, job: () => Promise<void>, name: string) {
  let running = false
  const run = async () => {
    if (running) return
    running = true
    try {
      await job()
    } catch (error) {
      await logEvent('error', name, String(error))
    } finally {
      running = false
    }
  }
  void run()
  return setInterval(run, ms)
}

every(REMINDERS_EVERY_MS, sendReminders, 'przypomnienia')
every(24 * 60 * 60_000, () => pruneEvents(30), 'porządki dziennika')
every(
  24 * 60 * 60_000,
  async () => {
    const removed = await sweepRouteCache()
    if (removed) console.log(`worker: usunięto ${removed} starych tras`)
  },
  'porządki tras',
)
every(FX_EVERY_MS, refreshRates, 'kursy NBP')
every(LEAVE_CHECK_MS, leaveReminders, 'czas wyjść')
every(BRIEFING_CHECK_MS, eveningBriefing, 'podsumowanie na jutro')
every(
  BACKUP_CHECK_MS,
  async () => {
    const done = await nightlyBackup()
    if (done) await logEvent('ok', 'kopia zapasowa', String(done))
  },
  'kopia zapasowa',
)
console.log(
  `worker: przypomnienia co 30 s, kursy NBP co 6 h, kopia ${process.env.BACKUP_DIR ? `do ${process.env.BACKUP_DIR}` : 'wyłączona (brak BACKUP_DIR)'}`,
)

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => process.exit(0))
}

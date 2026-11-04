import { shiftClock, TRAVEL_MODE_LABELS } from '@planer/core'
import { and, eq, getDb, gte, lte, tripDocs, trips } from '@planer/core/db'
import { getRates } from '@planer/core/fx'
import { sendPush } from '@planer/core/push'
import { dueReminders, markReminderSent, unmarkReminderSent } from '@planer/core/reminders-db'
import { legsFromDoc, markLegAlerted, planLeg } from '@planer/core/routes'
import { nightlyBackup } from './backup'

// Zadania w tle: przypomnienia push z kart (co 30 s), odświeżanie kursów NBP (co 6 h)
// i nocna kopia bazy oraz plików (sprawdzane co 10 min, robione raz dziennie).

const REMINDERS_EVERY_MS = 30_000
const FX_EVERY_MS = 6 * 60 * 60_000
const BACKUP_CHECK_MS = 10 * 60_000
const LEAVE_CHECK_MS = 2 * 60_000
const LEAVE_LOOKAHEAD_MIN = 150
const LEAVE_NOTICE_MIN = 10

const toMinutes = (time: string) => {
  const [h = 0, m = 0] = time.split(':').map(Number)
  return h * 60 + m
}

/** „Czas wyjść”: świeży dojazd do następnej karty i push na chwilę przed godziną wyjścia. */
async function leaveReminders() {
  const today = Temporal.Now.plainDateISO('Europe/Warsaw').toString()
  const rows = await getDb()
    .select({ trip: trips, state: tripDocs.state })
    .from(trips)
    .innerJoin(tripDocs, eq(tripDocs.tripId, trips.id))
    .where(and(eq(trips.archived, false), lte(trips.startDate, today), gte(trips.endDate, today)))

  for (const { trip, state } of rows) {
    const now = Temporal.Now.zonedDateTimeISO(trip.timezone)
    const date = now.toPlainDate().toString()
    const clock = now.hour * 60 + now.minute
    for (const leg of legsFromDoc(state, date)) {
      if (!leg.route || !leg.arriveBy) continue
      const arrive = toMinutes(leg.arriveBy)
      if (arrive <= clock || arrive - clock > LEAVE_LOOKAHEAD_MIN) continue
      const request = { ...leg.route, date, leaveAt: leg.leaveAt, arriveBy: leg.arriveBy }
      const { plan } = await planLeg(request, trip)
      if (!plan) continue
      const leaveBy = shiftClock(
        plan.departAt ?? shiftClock(leg.arriveBy, -plan.minutes),
        -trip.travelBufferMin,
      )
      if (clock < toMinutes(leaveBy) - LEAVE_NOTICE_MIN) continue
      if (!(await markLegAlerted(request, trip.travelMode))) continue
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
      console.warn(`worker: ${name} —`, String(error))
    } finally {
      running = false
    }
  }
  void run()
  return setInterval(run, ms)
}

every(REMINDERS_EVERY_MS, sendReminders, 'przypomnienia')
every(FX_EVERY_MS, refreshRates, 'kursy NBP')
every(LEAVE_CHECK_MS, leaveReminders, 'czas wyjść')
every(
  BACKUP_CHECK_MS,
  async () => {
    const done = await nightlyBackup()
    if (done) console.log(`worker: kopia zapasowa ${done}`)
  },
  'kopia zapasowa',
)
console.log(
  `worker: przypomnienia co 30 s, kursy NBP co 6 h, kopia ${process.env.BACKUP_DIR ? `do ${process.env.BACKUP_DIR}` : 'wyłączona (brak BACKUP_DIR)'}`,
)

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => process.exit(0))
}

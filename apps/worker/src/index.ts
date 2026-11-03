import { eq, getDb, trips } from '@planer/core/db'
import { getRates } from '@planer/core/fx'
import { sendPush } from '@planer/core/push'
import { dueReminders, markReminderSent, unmarkReminderSent } from '@planer/core/reminders-db'
import { nightlyBackup } from './backup'

// Zadania w tle: przypomnienia push z kart (co 30 s), odświeżanie kursów NBP (co 6 h)
// i nocna kopia bazy oraz plików (sprawdzane co 10 min, robione raz dziennie).

const REMINDERS_EVERY_MS = 30_000
const FX_EVERY_MS = 6 * 60 * 60_000
const BACKUP_CHECK_MS = 10 * 60_000

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

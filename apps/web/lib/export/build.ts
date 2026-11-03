import 'server-only'
import { exportModel, type RateLookup, todayLocal } from '@planer/core'
import type { Trip } from '@planer/core/db'
import { getRates } from '@planer/core/fx'
import { loadTripDoc } from '@/lib/ai/trip-data'

/** Model eksportu wyjazdu z zapisanego dokumentu + kursy NBP do sum (z dat kart, przyszłość — dziś). */
export async function buildExport(trip: Trip, opts: { files?: boolean } = {}) {
  const doc = await loadTripDoc(trip.id)
  const model = exportModel(doc, trip, opts)
  const today = Temporal.Now.plainDateISO('Europe/Warsaw').toString()
  const pairs = [
    ...model.cards.flatMap((c) =>
      (c.amounts ?? []).map((a) => ({
        currency: a.currency,
        date: c.date && c.date <= today ? c.date : today,
      })),
    ),
    ...trip.currencies.map((currency) => ({ currency, date: today })),
  ]
  const rates = await getRates(pairs, today).catch(() => ({}) as Record<string, number>)
  const rate: RateLookup = (currency, date) => rates[`${currency}|${date}`]
  return { model, rate, today: today ?? todayLocal() }
}

export function fileSlug(title: string): string {
  return (
    title
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/ł/g, 'l')
      .replace(/Ł/g, 'L')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase() || 'wyjazd'
  )
}

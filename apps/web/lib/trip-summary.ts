import 'server-only'
import {
  type Amount,
  dateRange,
  type LatLng,
  readCards,
  spendingByDay,
  totals,
  weatherPlace,
} from '@planer/core'
import type { Trip } from '@planer/core/db'
import { getRates } from '@planer/core/fx'
import { loadTripDoc } from '@/lib/ai/trip-data'

export type TripSummary = {
  /** Suma kwot wszystkich kart w PLN; `main` w walucie głównej (gdy inna niż PLN i znamy kurs). */
  pln: number
  main?: Amount
  /** Czy jakakolwiek karta ma kwotę — bez tego pokazujemy „0 zł”, a nie wykres. */
  any: boolean
  /** Wydatki w PLN na każdy dzień wyjazdu, w kolejności dni. */
  days: { date: string; pln: number }[]
  /** Miejsce dla pogody dzisiaj (nocleg, miejsce dnia, jakiekolwiek). */
  place?: LatLng
}

/** Dane wysepki trwającego wyjazdu na liście wyjazdów: tylko poziom wyjazdu, bez kart. */
export async function tripSummary(trip: Trip, today: string): Promise<TripSummary> {
  const cards = readCards(await loadTripDoc(trip.id))
  const live = cards.filter((c) => !c.deletedAt)
  const main = trip.currencies[0] ?? 'PLN'
  const rateDate = (date?: string) => (date && date <= today ? date : today)
  const raw = await getRates(
    [
      ...live.flatMap((c) =>
        (c.amounts ?? []).map((a) => ({ currency: a.currency, date: rateDate(c.date) })),
      ),
      { currency: main, date: today },
    ],
    today,
  ).catch(() => ({}) as Record<string, number>)
  const rate = (currency: string, date: string) => raw[`${currency.toUpperCase()}|${date}`]
  const t = totals(live, rate, today, main)
  const tripDays = trip.startDate ? dateRange(trip.startDate, trip.endDate ?? trip.startDate) : []
  const perDay = spendingByDay(live, rate, today, tripDays)
  return {
    pln: t.pln,
    main: t.main,
    any: live.some((c) => c.amounts?.length),
    days: tripDays.map((date, i) => ({ date, pln: perDay[i] ?? 0 })),
    place: weatherPlace(cards, today),
  }
}

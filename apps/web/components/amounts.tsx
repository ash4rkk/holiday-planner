'use client'

import {
  type Amount,
  type CardSnapshot,
  formatAmount,
  sumByCurrency,
  todayLocal,
  totals,
} from '@planer/core'
import { useMemo } from 'react'
import { cx } from '@/components/ui'
import { rateDate, useRates } from '@/lib/use-rates'

/** Plakietka z sumą kwot karty (per waluta). */
export function AmountBadge({ amounts, className }: { amounts: Amount[]; className?: string }) {
  if (!amounts.length) return null
  return (
    <span
      className={cx(
        'shrink-0 rounded-small bg-orange/15 px-1.5 py-0.5 text-[11px] font-bold text-orange',
        className,
      )}
    >
      {sumByCurrency(amounts).map(formatAmount).join(' + ')}
    </span>
  )
}

/** Sumy kart w PLN i walucie głównej wyjazdu, po kursach NBP z dat kart. */
export function useTotals(cards: CardSnapshot[], mainCurrency: string) {
  const today = todayLocal()
  const pairs = useMemo(
    () => [
      ...cards.flatMap((c) =>
        (c.amounts ?? []).map((a) => ({ currency: a.currency, date: rateDate(c.date, today) })),
      ),
      { currency: mainCurrency, date: today },
    ],
    [cards, mainCurrency, today],
  )
  const rate = useRates(pairs)
  return useMemo(() => totals(cards, rate, today, mainCurrency), [cards, rate, today, mainCurrency])
}

/** „1 230 zł · ≈ 285 €” — zero kwot = nic. */
export function TotalsText({
  cards,
  mainCurrency,
  className,
}: {
  cards: CardSnapshot[]
  mainCurrency: string
  className?: string
}) {
  const t = useTotals(cards, mainCurrency)
  const any = cards.some((c) => !c.deletedAt && c.amounts?.length)
  if (!any) return null
  return (
    <span className={cx('text-orange', className)}>
      {[
        t.pln > 0 && formatAmount({ value: t.pln, currency: 'PLN' }),
        t.main && t.main.value > 0 && `≈ ${formatAmount(t.main)}`,
        ...t.unconverted.map((a) => `+ ${formatAmount(a)} (bez kursu)`),
      ]
        .filter(Boolean)
        .join(' · ')}
    </span>
  )
}

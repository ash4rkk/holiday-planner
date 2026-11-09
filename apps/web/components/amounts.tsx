'use client'

import {
  type Amount,
  type CardSnapshot,
  formatAmount,
  sumByCurrency,
  todayLocal,
  totals,
} from '@planer/core'
import { Info } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { cx } from '@/components/ui'
import { rateDate, useRates } from '@/lib/use-rates'

/** Plakietka z sumą kwot karty (per waluta). */
export function AmountBadge({
  amounts,
  className,
  plain,
}: {
  amounts: Amount[]
  className?: string
  /** Sama kwota bez tła (Lista): nie konkuruje z tytułem karty. */
  plain?: boolean
}) {
  if (!amounts.length) return null
  return (
    <span
      className={cx(
        // Kwota bez koloru (pomarańcz to typ „jedzenie”): pogrubione cyfry o stałej szerokości.
        'shrink-0 text-2xs font-bold text-text tabular-nums',
        !plain && 'rounded-small bg-raised px-1.5 py-0.5',
        className,
      )}
    >
      {sumByCurrency(amounts).map(formatAmount).join(' + ')}
    </span>
  )
}

/** Liczba dochodzi do nowej wartości w ~300 ms zamiast przeskakiwać. */
function useAnimatedNumber(target: number): number {
  const [shown, setShown] = useState(target)
  const from = useRef(target)
  useEffect(() => {
    const start = from.current
    if (start === target || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      from.current = target
      setShown(target)
      return
    }
    const began = performance.now()
    let frame = requestAnimationFrame(function step(now) {
      const p = Math.min(1, (now - began) / 300)
      const value = start + (target - start) * (1 - (1 - p) ** 3)
      from.current = value
      setShown(p === 1 ? target : Math.round(value * 100) / 100)
      if (p < 1) frame = requestAnimationFrame(step)
    })
    return () => cancelAnimationFrame(frame)
  }, [target])
  return shown
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
  const pln = useAnimatedNumber(t.pln)
  const main = useAnimatedNumber(t.main?.value ?? 0)
  const any = cards.some((c) => !c.deletedAt && c.amounts?.length)
  if (!any) return null
  return (
    <span className={cx('font-bold tabular-nums', className)}>
      {[
        t.pln > 0 && formatAmount({ value: pln, currency: 'PLN' }),
        t.main && t.main.value > 0 && `≈ ${formatAmount({ ...t.main, value: main })}`,
        ...t.unconverted.map((a) => `+ ${formatAmount(a)} (bez kursu)`),
      ]
        .filter(Boolean)
        .join(' · ')}
    </span>
  )
}

/**
 * Suma dnia w nagłówku: w walucie bazowej wyjazdu, z (i). Najechanie myszą albo dotknięcie pokazuje
 * złotówki (dotknięcie przełącza na stałe, do następnego). Wyjazd w PLN: sama kwota, bez (i).
 */
export function DayTotal({ cards, mainCurrency }: { cards: CardSnapshot[]; mainCurrency: string }) {
  const t = useTotals(cards, mainCurrency)
  const [pinned, setPinned] = useState(false)
  const [hover, setHover] = useState(false)
  if (!t.pln && !t.unconverted.length) return null
  const plnText = formatAmount({ value: t.pln, currency: 'PLN' })
  const extra = t.unconverted.map((a) => ` + ${formatAmount(a)}`).join('')
  if (!t.main)
    return (
      <span className="shrink-0 text-xs font-bold tabular-nums">
        {plnText}
        {extra}
      </span>
    )
  const showPln = pinned || hover
  return (
    <button
      type="button"
      onClick={() => setPinned((v) => !v)}
      onPointerEnter={(e) => e.pointerType === 'mouse' && setHover(true)}
      onPointerLeave={(e) => e.pointerType === 'mouse' && setHover(false)}
      aria-pressed={showPln}
      aria-label={`wydatki dnia: ${formatAmount(t.main)}, w złotych ${plnText}`}
      title={showPln ? `w ${t.main.currency}: ${formatAmount(t.main)}` : `w złotych: ${plnText}`}
      className="hit flex shrink-0 items-center gap-1 text-xs font-bold tabular-nums hover:text-accent"
    >
      {showPln ? plnText : formatAmount(t.main)}
      {extra}
      <Info className="size-3.5 text-subtle" aria-hidden="true" />
    </button>
  )
}

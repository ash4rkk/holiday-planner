import * as Flags from 'country-flag-icons/react/3x2'
import { cx } from '@/components/ui'

// Komponent serwerowy: wszystkie flagi zostają w bundlu serwera, klient dostaje tylko gotowe SVG.
// Flagi to jedyne kolory spoza tokenów Vague — barwy kraju, nie motywu.

const names = new Intl.DisplayNames('pl', { type: 'region' })

/** Flaga 3:2 z zaokrąglonymi rogami; nieznany kod albo brak kraju = nic. */
export function Flag({ country, className }: { country?: string | null; className?: string }) {
  const Svg = country ? Flags[country as keyof typeof Flags] : undefined
  if (!country || !Svg) return null
  return (
    <Svg
      role="img"
      aria-label={names.of(country)}
      className={cx('shrink-0 rounded-[3px] border border-line', className)}
    />
  )
}

export const countryName = (country?: string | null) =>
  country ? (names.of(country) ?? undefined) : undefined

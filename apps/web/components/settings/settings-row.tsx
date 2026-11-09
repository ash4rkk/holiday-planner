import type { LucideIcon } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { cx, SectionLabel } from '@/components/ui'

/**
 * Wiersz menu ustawień: ikona, etykieta, wartość z prawej i „›” — otwiera podstronę.
 * `warn`: wartość to coś do naprawienia (np. brak klucza AI) — bursztyn z „●”.
 */
export function SettingsRow({
  href,
  label,
  value,
  icon: Icon,
  warn = false,
}: {
  href: string
  label: string
  value?: ReactNode
  icon?: LucideIcon
  warn?: boolean
}) {
  return (
    <li className="border-line not-first:border-t">
      <Link
        href={href}
        className="group flex min-h-12 items-center gap-3 px-4 text-sm hover:text-accent"
      >
        {Icon && (
          <Icon
            className="size-4 shrink-0 text-subtle group-hover:text-accent"
            aria-hidden="true"
          />
        )}
        <span className="flex-1">{label}</span>
        {value !== undefined && value !== null && (
          <span className={cx('text-right', warn ? 'font-bold text-amber' : 'text-muted')}>
            {warn && '● '}
            {value}
          </span>
        )}
        <span className="text-muted" aria-hidden="true">
          ›
        </span>
      </Link>
    </li>
  )
}

/** Grupa wierszy w jednej wysepce, z podpisem nad nią (jak sekcje na Liście). */
export function SettingsGroup({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <section aria-label={label}>
      {label && <SectionLabel>{label}</SectionLabel>}
      <ul className="island">{children}</ul>
    </section>
  )
}

/** Nagłówek podstrony ustawień: powrót do /settings. */
export const SETTINGS_BACK = { href: '/settings', label: 'wróć do ustawień' }

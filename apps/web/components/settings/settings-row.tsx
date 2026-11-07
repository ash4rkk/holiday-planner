import Link from 'next/link'
import type { ReactNode } from 'react'

/** Wiersz menu ustawień: etykieta, wartość z prawej i „›” — otwiera podstronę. */
export function SettingsRow({
  href,
  label,
  value,
}: {
  href: string
  label: string
  value?: ReactNode
}) {
  return (
    <li className="border-line not-first:border-t">
      <Link href={href} className="flex min-h-12 items-center gap-3 px-4 text-sm hover:text-accent">
        <span className="flex-1">{label}</span>
        {value !== undefined && <span className="text-muted">{value}</span>}
        <span className="text-muted" aria-hidden="true">
          ›
        </span>
      </Link>
    </li>
  )
}

/** Grupa wierszy w jednej wysepce. */
export function SettingsGroup({ children }: { children: ReactNode }) {
  return <ul className="island">{children}</ul>
}

/** Nagłówek podstrony ustawień: powrót do /settings. */
export const SETTINGS_BACK = { href: '/settings', label: 'wróć do ustawień' }

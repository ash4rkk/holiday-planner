import Link from 'next/link'
import type { ReactNode } from 'react'
import { ThemeToggle } from './theme-toggle'

/** Wyjście z widoków wyjazdu do wyboru wyjazdów. */
export const TRIPS_BACK = { href: '/trips', label: 'wszystkie wyjazdy' }

/** Nagłówek ekranu: wysepka z tytułem, opcjonalny powrót i akcje, przełącznik motywu. */
export function TopBar({
  title,
  subtitle,
  back,
  actions,
  theme = true,
}: {
  title: ReactNode
  subtitle?: ReactNode
  back?: { href: string; label: string }
  actions?: ReactNode
  /** Przełącznik motywu — w widokach wyjazdu wyłączony, żeby zmieścił się tytuł i przyciski wyjazdu. */
  theme?: boolean
}) {
  return (
    <header className="flex gap-1">
      {back && (
        <Link
          href={back.href}
          aria-label={back.label}
          title={back.label}
          className="island flex size-11 shrink-0 items-center justify-center text-muted hover:text-accent"
        >
          <span aria-hidden="true" className="text-lg">
            ‹
          </span>
        </Link>
      )}
      <div className="island flex min-h-11 min-w-0 flex-1 items-center gap-2 px-4 py-1">
        <h1 className="truncate text-lg font-bold">{title}</h1>
        {subtitle && (
          <span className="ml-auto shrink-0 text-xs text-subtle italic">{subtitle}</span>
        )}
      </div>
      {actions}
      {theme && <ThemeToggle />}
    </header>
  )
}

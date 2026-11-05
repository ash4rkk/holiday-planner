import Link from 'next/link'
import { type ReactNode, ViewTransition } from 'react'
import { MoreMenu } from './more-menu'
import { ThemeToggle } from './theme-toggle'
import { cx } from './ui'

/** Wyjście z widoków wyjazdu do wyboru wyjazdów. */
export const TRIPS_BACK = { href: '/trips', label: 'wszystkie wyjazdy' }

/** Nagłówek ekranu: dwie wysepki w rogach, z lewej powrót i tytuł, z prawej akcje i motyw. */
export function TopBar({
  title,
  subtitle,
  back,
  actions,
  more,
  theme = true,
  morph,
}: {
  title: ReactNode
  subtitle?: ReactNode
  back?: { href: string; label: string }
  actions?: ReactNode
  /** Rzadsze akcje: na telefonie w „⋯”, na szerszym ekranie obok reszty. */
  more?: ReactNode
  /** Przełącznik motywu — w widokach wyjazdu wyłączony, żeby zmieścił się tytuł i przyciski wyjazdu. */
  theme?: boolean
  /** Nazwa wspólnego elementu: tytuł płynnie przechodzi z kafelka wyjazdu do nagłówka. */
  morph?: string
}) {
  return (
    <header className="flex items-center gap-1">
      <div className="island flex min-h-11 min-w-0 items-center">
        {back && (
          <Link
            href={back.href}
            aria-label={back.label}
            title={back.label}
            className="flex size-11 shrink-0 items-center justify-center text-muted hover:text-accent"
          >
            <span aria-hidden="true" className="text-lg">
              ‹
            </span>
          </Link>
        )}
        <div className={cx('flex min-w-0 items-center gap-2 py-1 pr-4', !back && 'pl-4')}>
          <ViewTransition name={morph}>
            <h1 className="truncate text-lg font-bold">{title}</h1>
          </ViewTransition>
          {subtitle && <span className="shrink-0 text-xs text-subtle italic">{subtitle}</span>}
        </div>
      </div>
      {(actions || more || theme) && (
        <div className="top-actions island ml-auto flex shrink-0 items-center">
          {actions}
          {more && <MoreMenu>{more}</MoreMenu>}
          {theme && <ThemeToggle />}
        </div>
      )}
    </header>
  )
}

import Link from 'next/link'
import { type ReactNode, ViewTransition } from 'react'
import { MoreMenu } from './more-menu'
import { cx } from './ui'

/** Wyjście z widoków wyjazdu do wyboru wyjazdów. */
export const TRIPS_BACK = { href: '/trips', label: 'wszystkie wyjazdy' }

/** Wysepka paska: ten sam kształt co menu dolne (pełne zaokrąglenie, `raised`, cień). */
const BAR_ISLAND = 'rounded-full border border-sel bg-raised shadow-float'

/** Nagłówek ekranu: dwie wysepki w rogach, z lewej powrót i tytuł, z prawej akcje. Motyw tylko w ustawieniach. */
export function TopBar({
  title,
  subtitle,
  back,
  actions,
  more,
  morph,
  menu,
}: {
  title: ReactNode
  subtitle?: ReactNode
  back?: { href: string; label: string }
  actions?: ReactNode
  /** Rzadsze akcje: na telefonie w „⋯”, na szerszym ekranie obok reszty. */
  more?: ReactNode
  /** Nazwa wspólnego elementu: tytuł płynnie przechodzi z kafelka wyjazdu do nagłówka. */
  morph?: string
  /** Przycisk za nazwą w lewej wysepce, oddzielony kreską (menu wyjazdu). */
  menu?: ReactNode
}) {
  return (
    <header className="flex items-center gap-1">
      <div className={cx(BAR_ISLAND, 'flex min-h-11 min-w-0 items-center')}>
        {back && (
          <Link
            href={back.href}
            aria-label={back.label}
            title={back.label}
            className="flex size-11 shrink-0 items-center justify-center pl-1 text-muted hover:text-accent"
          >
            <span aria-hidden="true" className="text-lg">
              ‹
            </span>
          </Link>
        )}
        <div
          className={cx(
            'flex min-w-0 items-center gap-2 py-1',
            menu ? 'pr-3' : 'pr-4',
            !back && 'pl-4',
          )}
        >
          <ViewTransition name={morph}>
            <h1 className="truncate text-lg font-bold">{title}</h1>
          </ViewTransition>
          {subtitle && <span className="shrink-0 text-xs text-subtle">{subtitle}</span>}
        </div>
        {menu}
      </div>
      {(actions || more) && (
        <div className={cx(BAR_ISLAND, 'top-actions ml-auto flex shrink-0 items-center px-0.5')}>
          {actions}
          {more && <MoreMenu>{more}</MoreMenu>}
        </div>
      )}
    </header>
  )
}

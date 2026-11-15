'use client'

import { Info } from 'lucide-react'
import { type ReactNode, useRef, useState } from 'react'
import { cx } from '@/components/ui'
import { useDismiss } from '@/lib/use-dismiss'
import { Mark } from './day-cell'
import { type Layers, leaveBg } from './model'

/**
 * Legenda kalendarza: kolory urlopu (wspólny i osoby) zawsze widoczne, resztę (święta, wydarzenia,
 * wyjazdy, dziś) otwiera „legenda”. Pokazuje tylko to, co włączone w warstwach.
 */
export function Legend({
  layers,
  calendars,
  persons,
  regionsText,
}: {
  layers: Layers
  calendars: number
  persons: string[]
  /** według czyich świąt liczone są dni */
  regionsText: string
}) {
  const items: { key: string; icon: ReactNode; label: string }[] = [
    {
      key: 'leave',
      icon: <span className="inline-block size-3 rounded-[3px] bg-accent" />,
      label: persons.length ? 'urlop wspólny' : 'urlop',
    },
    ...persons.map((name) => ({
      key: `p-${name}`,
      icon: <span className={cx('inline-block size-3 rounded-[3px]', leaveBg(name, persons))} />,
      label: `urlop · ${name}`,
    })),
    {
      key: 'pending',
      icon: (
        <span className="leave-pending inline-flex size-3 items-center justify-center rounded-[3px] [--leave-tone:var(--color-accent)]">
          <span className="size-[5px] rounded-full border border-current" />
        </span>
      ),
      label: 'do zatwierdzenia',
    },
    {
      key: 'free',
      icon: <span className="leave-free inline-block size-3 rounded-[3px] bg-accent" />,
      label: 'urlop bez liczenia (weekend, święto)',
    },
    {
      key: 'off',
      icon: <span className="inline-block size-3 rounded-[3px] border border-line bg-raised" />,
      label: 'weekend i święta',
    },
  ]
  if (layers.pl) items.push({ key: 'pl', icon: <Mark kind="pl" />, label: 'święto w Polsce' })
  if (layers.bb)
    items.push({ key: 'bb', icon: <Mark kind="bb" />, label: 'święto w Brandenburgii' })
  if (layers.trips) {
    items.push({
      key: 'trip',
      icon: <span className="inline-block h-0.5 w-3 rounded-full bg-trip" />,
      label: 'wyjazd',
    })
  }
  if (calendars > layers.hiddenCalendars.length) {
    items.push({ key: 'event', icon: <Mark kind="event" />, label: 'wydarzenie (kolor etykiety)' })
    items.push({
      key: 'event-multi',
      icon: (
        <span className="inline-block size-3 rounded-[3px] bg-linear-to-r from-event/60 to-event/10" />
      ),
      label: 'kilkudniowe (tytuł pionowo)',
    })
  }
  items.push({
    key: 'today',
    icon: <span className="inline-block size-3 rounded-[3px] border-2 border-sel" />,
    label: 'dziś',
  })

  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useDismiss(open, () => setOpen(false), ref)
  const row = (i: (typeof items)[number]) => (
    <li key={i.key} className="flex items-center gap-1.5">
      <span aria-hidden="true" className="flex size-3 items-center justify-center">
        {i.icon}
      </span>
      {i.label}
    </li>
  )

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-label="legenda"
        title="legenda"
        onClick={() => setOpen((o) => !o)}
        className={cx(
          'flex size-10 items-center justify-center rounded-inner',
          open ? 'bg-active text-text' : 'text-muted hover:text-accent',
        )}
      >
        <Info className="size-5" aria-hidden="true" />
      </button>
      {open && (
        <div className="island shadow-float pop-in absolute top-full right-0 z-(--z-popover) mt-1 flex w-72 flex-col gap-2 p-3 text-xs text-muted max-md:fixed max-md:inset-x-2 max-md:top-auto max-md:w-auto">
          <ul aria-label="legenda" className="flex flex-col gap-2">
            {items.map(row)}
          </ul>
          <p className="border-t border-line pt-2 text-subtle">{regionsText}</p>
        </div>
      )}
    </div>
  )
}

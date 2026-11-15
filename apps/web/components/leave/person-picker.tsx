'use client'

import { cx } from '@/components/ui'
import { leaveBg, personLabel, type Who } from './model'

/** Czyj urlop: każda osoba albo „oboje”; kafelek z kolorem urlopu tej osoby. */
export function PersonPicker({
  persons,
  value,
  onChange,
  label = 'czyj urlop',
}: {
  persons: string[]
  value: Who
  onChange: (who: Who) => void
  label?: string
}) {
  const options: Who[] = [...persons, null]
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1">
      {options.map((who) => {
        const on = who === value
        return (
          <button
            key={who ?? '∅'}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(who)}
            className={cx(
              'flex min-h-11 items-center gap-2 rounded-small border px-3 text-sm',
              on
                ? 'border-accent bg-active font-bold text-text'
                : 'border-line text-muted hover:text-accent',
            )}
          >
            <span
              aria-hidden="true"
              className={cx('size-3 rounded-[3px]', leaveBg(who, persons))}
            />
            {personLabel(who)}
          </button>
        )
      })}
    </div>
  )
}

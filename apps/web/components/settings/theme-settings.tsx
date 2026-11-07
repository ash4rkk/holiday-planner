'use client'

import { Monitor, Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import { cx } from '@/components/ui'

const OPTIONS = [
  { value: 'light', label: 'jasny', icon: Sun },
  { value: 'dark', label: 'ciemny', icon: Moon },
  { value: 'system', label: 'jak w systemie', icon: Monitor },
] as const

/** Motyw aplikacji — jedyne miejsce, w którym się go zmienia. */
export function ThemeSettings() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const choose = (next: string) => {
    // Przenikanie całego ekranu; bez wsparcia przeglądarki zmiana od razu.
    if (document.startViewTransition)
      document.startViewTransition(() => flushSync(() => setTheme(next)))
    else setTheme(next)
  }

  return (
    <section className="island flex flex-col gap-2 p-4 text-sm">
      <p className="font-bold">motyw</p>
      <div className="grid grid-cols-3 gap-1" role="radiogroup" aria-label="motyw">
        {OPTIONS.map(({ value, label, icon: Icon }) => {
          const on = mounted && theme === value
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => choose(value)}
              className={cx(
                'flex min-h-11 flex-col items-center justify-center gap-1 rounded-small border px-2 py-2 text-xs transition-colors',
                on
                  ? 'border-accent bg-raised text-accent'
                  : 'border-line text-muted hover:text-accent',
              )}
            >
              <Icon className="size-5" aria-hidden="true" />
              {label}
            </button>
          )
        })}
      </div>
    </section>
  )
}

import type { ComponentProps, ReactNode } from 'react'

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ')
}

const BUTTON = {
  primary: 'bg-accent text-on-accent hover:bg-accent-hover font-bold',
  island: 'island text-text hover:text-accent',
  ghost: 'text-muted hover:text-accent',
  danger: 'island text-red hover:bg-red/15',
} as const

export function buttonClass(variant: keyof typeof BUTTON = 'island', extra?: string): string {
  return cx(
    'inline-flex min-h-11 items-center justify-center gap-2 rounded-island px-4 transition-colors',
    'disabled:opacity-50 disabled:pointer-events-none',
    BUTTON[variant],
    extra,
  )
}

export const inputClass =
  'min-h-11 w-full rounded-small border border-line bg-raised px-3 text-text placeholder:text-subtle ' +
  'focus:border-accent focus:outline-none'

export function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string
  error?: string
  hint?: string
  children: ReactNode
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-subtle">{label}</span>
      {children}
      {error ? (
        <span className="text-xs text-red">● {error}</span>
      ) : hint ? (
        <span className="text-xs text-subtle">{hint}</span>
      ) : null}
    </label>
  )
}

export function Island({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cx('island', className)} {...props} />
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <h2 className="px-3 pt-3 pb-1 text-xs text-subtle italic">{children}</h2>
}

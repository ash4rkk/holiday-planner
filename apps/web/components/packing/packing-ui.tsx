'use client'

import type { PackingCategory } from '@planer/core'
import {
  Droplets,
  FileText,
  type LucideIcon,
  Package,
  Pill,
  Plug,
  Shirt,
  Users,
} from 'lucide-react'
import { cx } from '@/components/ui'

// Drobne elementy listy pakowania: osoby, pierścień i paski postępu, ikony kategorii.

export const CATEGORY_ICON: Record<PackingCategory, LucideIcon> = {
  dokumenty: FileText,
  ubrania: Shirt,
  kosmetyki: Droplets,
  elektronika: Plug,
  apteczka: Pill,
  inne: Package,
}

export const ownerLabel = (me: string, name?: string) =>
  !name ? 'wspólne' : name === me ? 'ja' : name

/** Kolejno: wspólne → ja → inne osoby → wspólne. */
export function nextOwner(people: string[], me: string, owner?: string): string | undefined {
  const order = [undefined, me, ...people.filter((p) => p !== me)]
  return order[(order.indexOf(owner) + 1) % order.length]
}

/** Kółko osoby: ja w akcencie, druga osoba niebieska, wspólne z ikoną. */
export function OwnerDot({
  me,
  owner,
  size = 'md',
}: {
  me: string
  owner?: string
  size?: 'sm' | 'md'
}) {
  const box = size === 'sm' ? 'size-5 text-2xs' : 'size-7 text-xs'
  if (!owner)
    return (
      <span
        className={cx(
          'flex shrink-0 items-center justify-center rounded-full bg-raised text-subtle',
          box,
        )}
      >
        <Users className={size === 'sm' ? 'size-3' : 'size-3.5'} aria-hidden="true" />
      </span>
    )
  return (
    <span
      className={cx(
        'flex shrink-0 items-center justify-center rounded-full font-bold text-on-accent',
        owner === me ? 'bg-accent' : 'bg-blue',
        box,
      )}
    >
      {owner.slice(0, 1).toUpperCase()}
    </span>
  )
}

export function Ring({
  value,
  total,
  size = 88,
  stroke = 8,
}: {
  value: number
  total: number
  size?: number
  stroke?: number
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const part = total ? value / total : 0
  const done = total > 0 && value === total
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden="true"
      className="shrink-0 -rotate-90"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={stroke}
        className="stroke-raised"
      />
      {/* Bez postępu nic: zaokrąglony koniec kreski o długości 0 rysuje kropkę. */}
      {part > 0 && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${c * part} ${c}`}
          className={cx(
            'transition-[stroke-dasharray] duration-500',
            done ? 'stroke-green' : 'stroke-accent',
          )}
        />
      )}
    </svg>
  )
}

export function Bar({
  value,
  total,
  className,
}: {
  value: number
  total: number
  className?: string
}) {
  const done = total > 0 && value === total
  return (
    <div className={cx('h-1 overflow-hidden rounded-full bg-raised', className)} aria-hidden="true">
      <div
        className={cx(
          'h-full rounded-full transition-[width] duration-300',
          done ? 'bg-green' : 'bg-accent',
        )}
        style={{ width: `${total ? (value / total) * 100 : 0}%` }}
      />
    </div>
  )
}

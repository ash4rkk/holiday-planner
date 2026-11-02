import type { CardType } from '@planer/core'
import {
  BedDouble,
  Landmark,
  type LucideIcon,
  StickyNote,
  TrainFront,
  UtensilsCrossed,
} from 'lucide-react'

// Kolory znaczeniowe z docs/plan.md; klasy pełne, żeby Tailwind je znalazł.
export const TYPE_STYLE: Record<
  CardType,
  { icon: LucideIcon; text: string; chip: string; bar: string }
> = {
  stay: { icon: BedDouble, text: 'text-plum', chip: 'bg-plum/15 text-plum', bar: 'bg-plum' },
  sight: { icon: Landmark, text: 'text-amber', chip: 'bg-amber/15 text-amber', bar: 'bg-amber' },
  food: {
    icon: UtensilsCrossed,
    text: 'text-green',
    chip: 'bg-green/15 text-green',
    bar: 'bg-green',
  },
  transport: { icon: TrainFront, text: 'text-blue', chip: 'bg-blue/15 text-blue', bar: 'bg-blue' },
  note: { icon: StickyNote, text: 'text-teal', chip: 'bg-teal/15 text-teal', bar: 'bg-teal' },
}

export function formatDuration(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  if (!h) return `${m} min`
  return m ? `${h} h ${m} min` : `${h} h`
}

export const REMIND_OPTIONS = [15, 30, 60, 120, 180, 1440] as const

export function formatRemind(min: number): string {
  if (min >= 1440 && min % 1440 === 0)
    return min === 1440 ? '1 dzień przed' : `${min / 1440} dni przed`
  return `${formatDuration(min)} przed`
}

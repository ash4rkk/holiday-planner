'use client'

import { freeSpan, type HolidayRegion, isIsoDate, leaveDays } from '@planer/core'
import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { buttonClass, Field, inputClass } from '@/components/ui'
import { useDismiss } from '@/lib/use-dismiss'

const daysWord = (n: number) => (n === 1 ? 'dzień' : 'dni')

export interface SheetValue {
  startDate: string
  endDate: string
  note: string
}

/** Arkusz dodawania i edycji urlopu: od–do, notatka i liczba dni na żywo. */
export function LeaveSheet({
  title,
  initial,
  region,
  error,
  busy,
  onSave,
  onDelete,
  onClose,
}: {
  title: string
  initial: SheetValue
  region: HolidayRegion
  error?: string
  busy?: boolean
  onSave: (v: SheetValue) => void
  onDelete?: () => void
  onClose: () => void
}) {
  const [v, setV] = useState(initial)
  const ref = useRef<HTMLFormElement>(null)
  useDismiss(true, onClose, ref)
  const valid = isIsoDate(v.startDate) && isIsoDate(v.endDate)
  const [a, b] = v.startDate <= v.endDate ? [v.startDate, v.endDate] : [v.endDate, v.startDate]
  const days = valid ? leaveDays(a, b, region) : 0
  const free = valid ? freeSpan(a, b, region) : 0

  return createPortal(
    <div className="fixed inset-0 z-(--z-sheet) flex items-end justify-center">
      <div className="fade-in absolute inset-0 bg-bg/60" aria-hidden="true" />
      <form
        ref={ref}
        aria-label={title}
        onSubmit={(e) => {
          e.preventDefault()
          if (valid) onSave(v)
        }}
        className="island shadow-float sheet-in relative mx-px mb-px flex w-full max-w-xl flex-col gap-3 p-4 pb-[max(16px,env(safe-area-inset-bottom))]"
      >
        <h2 className="font-bold">{title}</h2>
        <div className="grid grid-cols-2 gap-2">
          <Field label="od">
            <input
              type="date"
              required
              value={v.startDate}
              onChange={(e) => setV({ ...v, startDate: e.target.value })}
              className={inputClass}
            />
          </Field>
          <Field label="do">
            <input
              type="date"
              required
              value={v.endDate}
              onChange={(e) => setV({ ...v, endDate: e.target.value })}
              className={inputClass}
            />
          </Field>
        </div>
        <p className="text-sm tabular-nums" aria-live="polite">
          <span className="font-bold">
            {days} {daysWord(days)} urlopu
          </span>
          <span className="text-muted">
            {' '}
            · {free} {daysWord(free)} wolnego
          </span>
        </p>
        <Field label="notatka">
          <input
            value={v.note}
            maxLength={200}
            placeholder="np. majówka"
            onChange={(e) => setV({ ...v, note: e.target.value })}
            className={inputClass}
          />
        </Field>
        {error && <p className="text-xs text-red">● {error}</p>}
        <div className="grid grid-cols-2 gap-1">
          {onDelete ? (
            <button type="button" onClick={onDelete} className={buttonClass('danger')}>
              do kosza
            </button>
          ) : (
            <button type="button" onClick={onClose} className={buttonClass('island')}>
              anuluj
            </button>
          )}
          <button type="submit" disabled={!valid || busy} className={buttonClass('primary')}>
            gotowe
          </button>
        </div>
      </form>
    </div>,
    document.body,
  )
}

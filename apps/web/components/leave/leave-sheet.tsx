'use client'

import { isIsoDate, type LeaveRegions } from '@planer/core'
import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { buttonClass, cx, Field, inputClass } from '@/components/ui'
import { useDismiss } from '@/lib/use-dismiss'
import { periodDaysText, type Who } from './model'
import { PersonPicker } from './person-picker'

export interface SheetValue {
  startDate: string
  endDate: string
  note: string
  person: Who
  approved: boolean
}

/** Arkusz dodawania i edycji urlopu: od–do, notatka i liczba dni na żywo. */
export function LeaveSheet({
  title,
  initial,
  regions,
  persons,
  error,
  busy,
  onSave,
  onDelete,
  onClose,
}: {
  title: string
  initial: SheetValue
  regions: LeaveRegions
  persons: string[]
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
  const daysText = valid
    ? periodDaysText({ startDate: a, endDate: b, person: v.person }, persons, regions)
    : ''

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
        <p className={cx('text-sm tabular-nums', !valid && 'invisible')} aria-live="polite">
          <span className="font-bold">{daysText.split(' · ').slice(0, -1).join(' · ')}</span>
          <span className="text-muted"> · {daysText.split(' · ').at(-1)}</span>
        </p>
        {persons.length > 0 && (
          <PersonPicker
            persons={persons}
            value={v.person}
            onChange={(person) => setV({ ...v, person })}
          />
        )}
        <div role="radiogroup" aria-label="status urlopu" className="flex flex-wrap gap-1">
          {[false, true].map((approved) => {
            const on = v.approved === approved
            return (
              <button
                key={String(approved)}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setV({ ...v, approved })}
                className={cx(
                  'flex min-h-11 items-center gap-2 rounded-small border px-3 text-sm',
                  on
                    ? 'border-accent bg-active font-bold text-text'
                    : 'border-line text-muted hover:text-accent',
                )}
              >
                <span
                  aria-hidden="true"
                  className={cx(
                    'size-3 rounded-[3px]',
                    approved ? 'bg-accent' : 'leave-pending [--leave-tone:var(--color-accent)]',
                  )}
                />
                {approved ? 'zatwierdzony' : 'do zatwierdzenia'}
              </button>
            )
          })}
        </div>
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

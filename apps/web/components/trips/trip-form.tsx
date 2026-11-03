'use client'

import type { Trip } from '@planer/core/db'
import { useActionState } from 'react'
import { buttonClass, Field, inputClass } from '@/components/ui'
import type { TripFormState } from '@/lib/trip-form'

// Lista podpowiedzi; pole przyjmuje każdą strefę IANA.
const TIMEZONES =
  typeof Intl.supportedValuesOf === 'function'
    ? Intl.supportedValuesOf('timeZone').filter((tz) =>
        /^(Europe|Atlantic|Africa|Asia|America)\//.test(tz),
      )
    : ['Europe/Warsaw']

type Action = (prev: TripFormState, form: FormData) => Promise<TripFormState>

export function TripForm({
  action,
  trip,
  submitLabel,
}: {
  action: Action
  trip?: Trip
  submitLabel: string
}) {
  const [state, formAction, pending] = useActionState(action, {})
  const v = state.values
  const e = state.errors ?? {}

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field label="nazwa" error={e.title}>
        <input
          name="title"
          required
          maxLength={100}
          defaultValue={v?.title ?? trip?.title}
          placeholder="np. Rzym i Neapol"
          className={inputClass}
          autoComplete="off"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="od" error={e.startDate}>
          <input
            type="date"
            name="startDate"
            defaultValue={v?.startDate ?? trip?.startDate ?? ''}
            className={inputClass}
          />
        </Field>
        <Field label="do" error={e.endDate}>
          <input
            type="date"
            name="endDate"
            defaultValue={v?.endDate ?? trip?.endDate ?? ''}
            className={inputClass}
          />
        </Field>
      </div>
      <Field
        label="waluty wyjazdu"
        error={e.currencies}
        hint="główna pierwsza, np. EUR, CHF; PLN jest zawsze"
      >
        <input
          name="currencies"
          defaultValue={v?.currencies ?? trip?.currencies.join(', ')}
          placeholder="EUR"
          className={inputClass}
          autoCapitalize="characters"
          autoComplete="off"
        />
      </Field>
      <Field
        label="strefa czasowa miejsca"
        error={e.timezone}
        hint="godziny kart i przypomnienia liczą się w tej strefie"
      >
        <input
          name="timezone"
          list="timezones"
          defaultValue={v?.timezone ?? trip?.timezone ?? 'Europe/Warsaw'}
          className={inputClass}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
        />
        <datalist id="timezones">
          {TIMEZONES.map((tz) => (
            <option key={tz} value={tz} />
          ))}
        </datalist>
      </Field>
      <button type="submit" disabled={pending} className={buttonClass('primary')}>
        {pending ? 'zapisuję…' : submitLabel}
      </button>
    </form>
  )
}

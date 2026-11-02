import { isIsoDate } from '@planer/core'
import { z } from 'zod'

export type TripFormState = {
  errors?: Partial<Record<'title' | 'startDate' | 'endDate' | 'currencies', string>>
  values?: Record<string, string>
}

const optionalDate = z
  .string()
  .trim()
  .transform((v) => v || undefined)
  .refine((v) => v === undefined || isIsoDate(v), 'nieprawidłowa data')

export const tripSchema = z
  .object({
    title: z.string().trim().min(1, 'podaj nazwę').max(100, 'najwyżej 100 znaków'),
    startDate: optionalDate,
    endDate: optionalDate,
    // „eur, CHF” → ['EUR', 'CHF']; PLN jest zawsze, więc go pomijamy.
    currencies: z
      .string()
      .transform((v) =>
        [
          ...new Set(
            v
              .toUpperCase()
              .split(/[\s,;]+/)
              .filter(Boolean),
          ),
        ].filter((c) => c !== 'PLN'),
      )
      .refine(
        (list) => list.every((c) => /^[A-Z]{3}$/.test(c)),
        'kody walut po 3 litery, np. EUR, CHF',
      ),
  })
  .refine((t) => !t.endDate || t.startDate, {
    path: ['startDate'],
    message: 'podaj też datę początku',
  })
  .refine((t) => !t.startDate || !t.endDate || t.endDate >= t.startDate, {
    path: ['endDate'],
    message: 'koniec przed początkiem',
  })

export function parseTripForm(form: FormData) {
  const raw = {
    title: String(form.get('title') ?? ''),
    startDate: String(form.get('startDate') ?? ''),
    endDate: String(form.get('endDate') ?? ''),
    currencies: String(form.get('currencies') ?? ''),
  }
  const parsed = tripSchema.safeParse(raw)
  if (parsed.success) return { ok: true as const, data: parsed.data }
  const errors: NonNullable<TripFormState['errors']> = {}
  for (const issue of parsed.error.issues) {
    const key = issue.path[0] as keyof typeof errors
    errors[key] ??= issue.message
  }
  return { ok: false as const, state: { errors, values: raw } satisfies TripFormState }
}

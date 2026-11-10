import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { CARD_TYPES, formatDateSpan, isIsoDate, isIsoTime, withoutAmounts } from '@planer/core'
import { z } from 'zod'
import { budgetLeftPln, MONTHLY_BUDGET_PLN, recordUsage } from '@/lib/ai/budget'
import { AI_MODEL, aiConfigured, anthropic, fallback } from '@/lib/ai/client'
import { attachmentBlock } from '@/lib/ai/files'
import { IMPORT_INSTRUCTIONS } from '@/lib/ai/prompts'
import { nowInTrip } from '@/lib/ai/trip-data'
import { getCurrentUser } from '@/lib/auth/user'
import { resolvePlace } from '@/lib/maps-resolve'
import { getTrip } from '@/lib/trips'

// Schemat odpowiedzi modelu (ustrukturyzowane wyjście — API gwarantuje zgodny JSON).
const Extracted = z.object({
  type: z.enum(CARD_TYPES),
  title: z.string().describe('krótki tytuł karty, np. „Lot WAW → FCO” albo nazwa hotelu'),
  date: z.string().nullable().describe('YYYY-MM-DD'),
  time: z.string().nullable().describe('HH:MM'),
  end_date: z.string().nullable().describe('YYYY-MM-DD, dla noclegów dzień wyjazdu'),
  location_name: z.string().nullable(),
  location_address: z.string().nullable(),
  amount: z.object({ value: z.number(), currency: z.string() }).nullable(),
  details: z.array(z.object({ label: z.string(), value: z.string() })),
  notes: z.string().nullable(),
})

export type ImportDraft = {
  type: (typeof CARD_TYPES)[number]
  title: string
  date?: string
  time?: string
  endDate?: string
  location?: { name: string; address?: string; lat?: number; lng?: number }
  amount?: { value: number; currency: string }
  details: { label: string; value: string }[]
  notes?: string
}

const body = z.object({ tripId: z.string(), attachmentId: z.string() })

/** Zdjęcie albo PDF (już zapisany jako załącznik) → szkic karty do zatwierdzenia. */
export async function POST(request: Request) {
  const user = await getCurrentUser()
  const parsed = body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'brak pliku' }, { status: 400 })
  const { tripId, attachmentId } = parsed.data
  const trip = await getTrip(tripId)
  if (!trip) return Response.json({ error: 'nie ma takiego wyjazdu' }, { status: 404 })
  if (!aiConfigured())
    return Response.json({ error: 'AI nie jest skonfigurowane na serwerze' }, { status: 503 })
  if ((await budgetLeftPln()) <= 0) {
    return Response.json(
      { error: `limit AI na ten miesiąc (${MONTHLY_BUDGET_PLN} zł) wyczerpany` },
      { status: 402 },
    )
  }
  const file = await attachmentBlock(attachmentId, tripId)
  if ('error' in file) return Response.json({ error: file.error }, { status: 422 })

  let response: Awaited<ReturnType<ReturnType<typeof anthropic>['beta']['messages']['parse']>>
  try {
    response = await anthropic().beta.messages.parse(
      {
        model: AI_MODEL,
        max_tokens: 16000,
        ...fallback(),
        output_config: { effort: 'medium', format: betaZodOutputFormat(Extracted) },
        system: IMPORT_INSTRUCTIONS,
        messages: [
          {
            role: 'user',
            content: [
              file.block,
              {
                type: 'text',
                text: `Wyjazd: ${trip.title} (${formatDateSpan(trip.startDate, trip.endDate)}), waluty: PLN${
                  trip.currencies.length ? `, ${trip.currencies.join(', ')}` : ''
                }. Teraz: ${nowInTrip(trip.timezone)}. Plik: ${file.name}. Zamień ten dokument na kartę planu.`,
              },
            ],
          },
        ],
      },
      // Bez ponowień w SDK (każde kosztuje, a kolejka w telefonie i tak ponawia) i z limitem
      // krótszym niż 100 s Cloudflare, żeby telefon dostał odpowiedź, a nie zerwane połączenie.
      { maxRetries: 0, timeout: 90_000 },
    )
  } catch (error) {
    console.warn('[ai] import', String(error))
    // Błąd trwały (plik za duży, za dużo stron, nieczytelny PDF): ponawianie nic nie da.
    if (
      error instanceof Anthropic.BadRequestError ||
      (error instanceof Anthropic.APIError && error.status === 413)
    )
      return Response.json(
        { error: 'AI nie przyjęło tego pliku (za duży albo za dużo stron)' },
        { status: 422 },
      )
    return Response.json({ error: 'AI nie odczytało pliku — spróbuj ponownie' }, { status: 502 })
  }
  await recordUsage({
    userId: user.id,
    kind: 'import',
    model: response.model,
    usage: response.usage,
  })
  const out = response.parsed_output as z.infer<typeof Extracted> | null
  if (response.stop_reason === 'refusal' || !out) {
    return Response.json({ error: 'AI nie rozpoznało tego dokumentu' }, { status: 422 })
  }

  const notes = withoutAmounts(out.notes ?? '')
  // Model trzyma się schematu, ale formaty pól sprawdzamy sami — zły format = puste pole.
  const currency = out.amount?.currency.trim().toUpperCase()
  const draft: ImportDraft = {
    type: out.type,
    title: out.title.trim().slice(0, 120) || file.name,
    ...(isIsoDate(out.date) && { date: out.date }),
    ...(isIsoTime(out.time) && { time: out.time }),
    ...(isIsoDate(out.end_date) && { endDate: out.end_date }),
    ...(out.amount &&
      out.amount.value > 0 &&
      currency &&
      /^[A-Z]{3}$/.test(currency) && {
        amount: { value: Math.round(out.amount.value * 100) / 100, currency },
      }),
    // Kwota jest tylko w polu `amount`: składnia /+ w tekście weszłaby do sum drugi raz.
    details: out.details
      .map((d) => ({ label: d.label, value: withoutAmounts(d.value) }))
      .filter((d) => d.label.trim() && d.value)
      .slice(0, 12),
    ...(notes && { notes }),
  }
  if (out.location_name?.trim()) {
    const name = out.location_name.trim()
    const address = out.location_address?.trim() || undefined
    // Współrzędne z geokodera, żeby karta od razu miała pinezkę na Mapie.
    const place = await resolvePlace({ text: [name, address].filter(Boolean).join('\n') }).catch(
      () => null,
    )
    draft.location = {
      name,
      ...(address && { address }),
      ...(place?.lat !== undefined && { lat: place.lat, lng: place.lng }),
    }
  }
  return Response.json({ draft })
}

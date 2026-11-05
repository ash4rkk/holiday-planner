import type Anthropic from '@anthropic-ai/sdk'
import { type CardProposal, normalizeProposals } from '@planer/core'
import { aiMessages, and, asc, eq, getDb, users } from '@planer/core/db'
import { z } from 'zod'
import { budgetLeftPln, MONTHLY_BUDGET_PLN, recordUsage, spentThisMonthPln } from '@/lib/ai/budget'
import { AI_MODEL, aiConfigured, anthropic, fallback } from '@/lib/ai/client'
import { attachmentBlock } from '@/lib/ai/files'
import { CHAT_INSTRUCTIONS } from '@/lib/ai/prompts'
import { attachmentInDoc, loadTripDoc, nowInTrip, tripContextFor } from '@/lib/ai/trip-data'
import { getCurrentUser } from '@/lib/auth/user'
import { resolvePlace } from '@/lib/maps-resolve'
import { getTrip } from '@/lib/trips'

type Param = Anthropic.Beta.BetaMessageParam
const MAX_ROUNDS = 6

const READ_ATTACHMENT: Anthropic.Beta.BetaTool = {
  name: 'read_attachment',
  description:
    'Odczytuje załącznik wyjazdu (bilet, rezerwację, paragon — PDF albo zdjęcie) po identyfikatorze z opisu wyjazdu (att:…). Użyj, gdy pytanie dotyczy szczegółów pliku.',
  input_schema: {
    type: 'object',
    properties: { id: { type: 'string', description: 'identyfikator pliku bez prefiksu att:' } },
    required: ['id'],
    additionalProperties: false,
  },
  strict: true,
  eager_input_streaming: true,
}
const nullable = (type: 'string' | 'number', description: string) => ({
  type: [type, 'null'],
  description,
})
const PROPOSE_CARDS: Anthropic.Beta.BetaTool = {
  name: 'propose_cards',
  description:
    'Proponuje nowe karty: każde polecane miejsce lub pomysł. Pokazują się przy odpowiedzi w czacie, a osoba wybiera, czy dodać je do pomysłów albo do planu. Najwyżej 8 kart.',
  input_schema: {
    type: 'object',
    properties: {
      cards: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['stay', 'sight', 'food', 'transport', 'note'] },
            title: { type: 'string', description: 'krótki tytuł karty' },
            date: nullable('string', 'YYYY-MM-DD'),
            time: nullable('string', 'HH:MM, czas lokalny miejsca'),
            duration_min: nullable('number', 'czas trwania w minutach'),
            place: nullable('string', 'nazwa miejsca z miastem'),
            amount: nullable('number', 'koszt'),
            currency: nullable('string', 'kod ISO, np. EUR'),
            notes: nullable('string', 'krótka notatka'),
          },
          required: [
            'type',
            'title',
            'date',
            'time',
            'duration_min',
            'place',
            'amount',
            'currency',
            'notes',
          ],
          additionalProperties: false,
        },
      },
    },
    required: ['cards'],
    additionalProperties: false,
  },
  strict: true,
  eager_input_streaming: true,
}
const WEB_SEARCH: Anthropic.Beta.BetaWebSearchTool20260209 = {
  type: 'web_search_20260209',
  name: 'web_search',
  max_uses: 3,
}

const body = z.object({ tripId: z.string(), message: z.string().trim().min(1).max(4000) })

/** Historia rozmowy wyjazdu (bez zarchiwizowanych). */
export async function GET(request: Request) {
  await getCurrentUser()
  const tripId = new URL(request.url).searchParams.get('tripId') ?? ''
  if (!(await getTrip(tripId)))
    return Response.json({ error: 'nie ma takiego wyjazdu' }, { status: 404 })
  const rows = await getDb()
    .select({
      id: aiMessages.id,
      role: aiMessages.role,
      text: aiMessages.text,
      sources: aiMessages.sources,
      proposals: aiMessages.proposals,
      createdAt: aiMessages.createdAt,
      author: users.name,
    })
    .from(aiMessages)
    .leftJoin(users, eq(users.id, aiMessages.userId))
    .where(and(eq(aiMessages.tripId, tripId), eq(aiMessages.archived, false)))
    .orderBy(asc(aiMessages.createdAt))
  return Response.json({
    messages: rows,
    configured: aiConfigured(),
    budget: { spent: await spentThisMonthPln(), limit: MONTHLY_BUDGET_PLN },
  })
}

/** „Nowa rozmowa”: dotychczasowe wiadomości przestają iść do modelu. */
export async function DELETE(request: Request) {
  await getCurrentUser()
  const tripId = new URL(request.url).searchParams.get('tripId') ?? ''
  await getDb().update(aiMessages).set({ archived: true }).where(eq(aiMessages.tripId, tripId))
  return Response.json({ ok: true })
}

/**
 * Pytanie do czatu → odpowiedź strumieniem SSE (event: text | status | proposal | done | error).
 * Każda zakończona tura zapisuje się jako dwie wiadomości (pytanie tak, jak poszło do modelu, i tekst
 * odpowiedzi). Historia wraca do modelu bez bloków rozumowania, więc opis wyjazdu w prompcie
 * systemowym może się zmieniać między pytaniami bez unieważniania niczego (tylko cache).
 */
export async function POST(request: Request) {
  const user = await getCurrentUser()
  const parsed = body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'puste pytanie' }, { status: 400 })
  const { tripId, message } = parsed.data
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

  const db = getDb()
  const doc = await loadTripDoc(tripId)
  const context = await tripContextFor(trip, doc)
  const history = await db
    .select({ role: aiMessages.role, content: aiMessages.content })
    .from(aiMessages)
    .where(and(eq(aiMessages.tripId, tripId), eq(aiMessages.archived, false)))
    .orderBy(asc(aiMessages.createdAt))
  const prompt = `[teraz: ${nowInTrip(trip.timezone)} · pyta: ${user.name}]\n${message}`
  const turn: Param[] = [{ role: 'user', content: [{ type: 'text', text: prompt }] }]

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      let answer = ''
      const sources = new Map<string, string>()
      const proposed: CardProposal[] = []
      try {
        for (let round = 0; round < MAX_ROUNDS; round++) {
          const s = anthropic().beta.messages.stream(
            {
              model: AI_MODEL,
              max_tokens: 16000,
              ...fallback(),
              // Czat nie potrzebuje głębokiego rozumowania; low to też niższy koszt.
              output_config: { effort: 'low' },
              system: [
                { type: 'text', text: CHAT_INSTRUCTIONS },
                { type: 'text', text: context, cache_control: { type: 'ephemeral' } },
              ],
              tools: [WEB_SEARCH, READ_ATTACHMENT, PROPOSE_CARDS],
              messages: [
                ...(history.map((h) => ({ role: h.role, content: h.content })) as Param[]),
                ...turn,
              ],
            },
            { signal: request.signal },
          )
          s.on('text', (delta) => {
            answer += delta
            send('text', { delta })
          })
          const msg = await s.finalMessage()
          await recordUsage({ userId: user.id, kind: 'chat', model: msg.model, usage: msg.usage })
          for (const block of msg.content) {
            if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
              for (const r of block.content) sources.set(r.url, r.title)
            }
          }
          turn.push({
            role: 'assistant',
            content: msg.content as Anthropic.Beta.BetaContentBlockParam[],
          })

          if (msg.stop_reason === 'pause_turn') continue // długie wyszukiwanie — wznawiamy tę samą turę
          if (msg.stop_reason === 'refusal') {
            if (!answer.trim()) {
              answer = 'Nie mogę pomóc w tej sprawie.'
              send('text', { delta: answer })
            }
            break
          }
          if (msg.stop_reason !== 'tool_use') break

          const calls = msg.content.filter(
            (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use',
          )
          const results: Anthropic.Beta.BetaToolResultBlockParam[] = []
          for (const call of calls) {
            if (call.name === 'propose_cards') {
              const cards = normalizeProposals(call.input, trip)
              send('status', { text: 'szukam miejsc na mapie…' })
              // Kolejno, nie równolegle: Nominatim przyjmuje jedno zapytanie na sekundę.
              for (const card of cards) {
                if (!card.place) continue
                const place = await resolvePlace({ text: card.place }).catch(() => null)
                card.location = {
                  name: card.place,
                  ...(place?.lat !== undefined && { lat: place.lat, lng: place.lng }),
                }
              }
              proposed.push(...cards)
              send('proposal', { cards })
              results.push({
                type: 'tool_result',
                tool_use_id: call.id,
                content: `Pokazano propozycji: ${cards.length}. Czekają na zatwierdzenie osoby — jeszcze ich nie ma w planie.`,
              })
              continue
            }
            const id = (call.input as { id?: unknown })?.id
            if (
              call.name !== 'read_attachment' ||
              typeof id !== 'string' ||
              !attachmentInDoc(doc, id.replace(/^att:/, ''))
            ) {
              results.push({
                type: 'tool_result',
                tool_use_id: call.id,
                is_error: true,
                content: 'nie ma takiego pliku w tym wyjeździe',
              })
              continue
            }
            const file = await attachmentBlock(id.replace(/^att:/, ''), tripId)
            if ('error' in file) {
              results.push({
                type: 'tool_result',
                tool_use_id: call.id,
                is_error: true,
                content: file.error,
              })
              continue
            }
            send('status', { text: `czytam ${file.name}…` })
            results.push({ type: 'tool_result', tool_use_id: call.id, content: [file.block] })
          }
          turn.push({ role: 'user', content: results })
          if (answer && !answer.endsWith('\n')) {
            answer += '\n\n'
            send('text', { delta: '\n\n' })
          }
        }

        const text = answer.trim() || '(brak odpowiedzi)'
        const list = [...sources].map(([url, title]) => ({ url, title })).slice(0, 8)
        await db.insert(aiMessages).values([
          {
            tripId,
            userId: user.id,
            role: 'user',
            content: [{ type: 'text', text: prompt }],
            text: message,
          },
          {
            tripId,
            userId: null,
            role: 'assistant',
            content: [{ type: 'text', text }],
            text,
            sources: list,
            proposals: proposed,
          },
        ])
        send('done', {
          sources: list,
          budget: { spent: await spentThisMonthPln(), limit: MONTHLY_BUDGET_PLN },
        })
      } catch (error) {
        console.warn('[ai] czat', String(error))
        send('error', {
          message: request.signal.aborted ? 'przerwano' : 'AI nie odpowiedziało — spróbuj ponownie',
        })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
      'x-accel-buffering': 'no',
    },
  })
}

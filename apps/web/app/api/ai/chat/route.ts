import Anthropic from '@anthropic-ai/sdk'
import {
  type CardChange,
  type CardLocation,
  type CardProposal,
  normalizeChanges,
  normalizeProposals,
  PROPOSAL_DECISIONS,
  proposalsSummary,
  readCards,
} from '@planer/core'
import { aiMessages, and, asc, desc, eq, getDb, sql, users } from '@planer/core/db'
import { z } from 'zod'
import { budgetLeftPln, MONTHLY_BUDGET_PLN, recordUsage, spentThisMonthPln } from '@/lib/ai/budget'
import { activeRun, endRun, startRun } from '@/lib/ai/chat-runs'
import { AI_MODEL, aiConfigured, anthropic, fallback } from '@/lib/ai/client'
import { attachmentBlock } from '@/lib/ai/files'
import { CHAT_INSTRUCTIONS } from '@/lib/ai/prompts'
import { attachmentInDoc, loadTripDoc, nowInTrip, tripContextFor } from '@/lib/ai/trip-data'
import { getCurrentUser } from '@/lib/auth/user'
import { geocode, resolvePlace } from '@/lib/maps-resolve'
import { getTrip } from '@/lib/trips'

type Param = Anthropic.Beta.BetaMessageParam
const MAX_ROUNDS = 6
// Do modelu idzie najwyżej 2 × tyle ostatnich wiadomości — dłuższa rozmowa drożałaby z każdym
// pytaniem. Tniemy skokami o ten krok, nie o jedną wiadomość: początek historii jest wtedy ten sam
// przez 10 kolejnych pytań i cache promptu ją czyta, zamiast zapisywać od nowa.
const HISTORY_STEP = 20
// Cisza w strumieniu (wyszukiwanie, rozumowanie): Cloudflare zrywa połączenie po 100 s bez danych.
const PING_MS = 15_000
const CUT_NOTE = '\n\n_(odpowiedź urwana — zapytaj o dalszy ciąg)_'

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
            address: nullable('string', 'pełny adres: ulica i numer, kod, miasto'),
            amount: nullable('number', 'koszt'),
            currency: nullable('string', 'kod ISO, np. EUR'),
            description: nullable('string', '1–2 zdania o miejscu: czym jest i dlaczego warto'),
            notes: nullable(
              'string',
              'praktyczne uwagi: wejście, kolejki, godziny, ubiór — bez powtarzania opisu',
            ),
            tickets_url: nullable('string', 'oficjalna strona kupna biletów lub rezerwacji'),
            needs_booking: {
              type: ['boolean', 'null'],
              description: 'trzeba kupić bilet lub zarezerwować',
            },
            variant_of: nullable(
              'string',
              'id istniejącej karty, której ta propozycja jest zamiennikiem (np. plan B na deszcz); inaczej null',
            ),
          },
          required: [
            'type',
            'title',
            'date',
            'time',
            'duration_min',
            'place',
            'address',
            'amount',
            'currency',
            'description',
            'notes',
            'tickets_url',
            'needs_booking',
            'variant_of',
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
const PROPOSE_CHANGES: Anthropic.Beta.BetaTool = {
  name: 'propose_changes',
  description:
    'Proponuje zmiany w istniejących kartach planu (godzina, dzień, czas trwania, status, miejsce, dopisek). Osoba widzi „było → będzie” i sama zatwierdza każdą zmianę. Pola bez zmiany: null. Najwyżej 8 zmian.',
  input_schema: {
    type: 'object',
    properties: {
      changes: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            card_id: { type: 'string', description: 'identyfikator karty z opisu wyjazdu' },
            reason: { type: 'string', description: 'krótko: dlaczego ta zmiana' },
            date: nullable('string', 'nowy dzień YYYY-MM-DD'),
            time: nullable('string', 'nowa godzina HH:MM, czas lokalny miejsca'),
            duration_min: nullable('number', 'nowy czas trwania w minutach'),
            // anyOf, nie type: ['string', 'null'] + enum — tryb strict odrzuca wtedy cały schemat (400).
            status: {
              anyOf: [{ type: 'string', enum: ['missing', 'booked', 'none'] }, { type: 'null' }],
              description:
                'missing = do rezerwacji, booked = zarezerwowane, none = bez statusu, null = bez zmiany',
            },
            place: nullable('string', 'nowa nazwa miejsca z miastem'),
            address: nullable('string', 'nowy pełny adres'),
            append_text: nullable('string', 'dopisek na końcu treści karty, np. „bilety: <link>”'),
          },
          required: [
            'card_id',
            'reason',
            'date',
            'time',
            'duration_min',
            'status',
            'place',
            'address',
            'append_text',
          ],
          additionalProperties: false,
        },
      },
    },
    required: ['changes'],
    additionalProperties: false,
  },
  strict: true,
}

const WEB_SEARCH: Anthropic.Beta.BetaWebSearchTool20260209 = {
  type: 'web_search_20260209',
  name: 'web_search',
  max_uses: 3,
}

const body = z.object({ tripId: z.string(), message: z.string().trim().min(1).max(4000) })

/**
 * Miejsce z propozycji AI: najpierw adres (dokładniejszy), potem nazwa z miastem. Do karty trafia
 * nazwa, adres i współrzędne — jak przy miejscu udostępnionym z Map Google.
 */
async function locate(place?: string, address?: string): Promise<CardLocation | undefined> {
  const name = place ?? address
  if (!name) return undefined
  const at =
    (address ? await geocode(address).catch(() => undefined) : undefined) ??
    (place ? await resolvePlace({ text: place }).catch(() => null) : null)
  return {
    name,
    ...(address && { address }),
    ...(at?.lat !== undefined && at.lng !== undefined && { lat: at.lat, lng: at.lng }),
  }
}

// Ta sama chwila zapisu: pytanie przed odpowiedzią (rola „user” > „assistant” alfabetycznie).
const chronological = [asc(aiMessages.createdAt), desc(aiMessages.role)] as const

/** Historia rozmowy wyjazdu (bez zarchiwizowanych) i czy ktoś właśnie czeka na odpowiedź. */
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
      changes: aiMessages.changes,
      decisions: aiMessages.decisions,
      createdAt: aiMessages.createdAt,
      author: users.name,
    })
    .from(aiMessages)
    .leftJoin(users, eq(users.id, aiMessages.userId))
    .where(and(eq(aiMessages.tripId, tripId), eq(aiMessages.archived, false)))
    .orderBy(...chronological)
  const run = activeRun(tripId)
  return Response.json({
    messages: rows,
    configured: aiConfigured(),
    budget: { spent: await spentThisMonthPln(), limit: MONTHLY_BUDGET_PLN },
    pending: run ? { author: run.userName, startedAt: run.startedAt } : null,
  })
}

/** „Nowa rozmowa”: dotychczasowe wiadomości przestają iść do modelu. */
export async function DELETE(request: Request) {
  await getCurrentUser()
  const tripId = new URL(request.url).searchParams.get('tripId') ?? ''
  if (activeRun(tripId))
    return Response.json({ error: 'poczekaj, aż AI skończy odpowiadać' }, { status: 409 })
  await getDb().update(aiMessages).set({ archived: true }).where(eq(aiMessages.tripId, tripId))
  return Response.json({ ok: true })
}

const decision = z.object({
  tripId: z.string(),
  messageId: z.string().uuid(),
  key: z.string().regex(/^[pc]\d{1,2}$/),
  value: z.enum(PROPOSAL_DECISIONS as [string, ...string[]]).nullable(),
})

/** Decyzja przy propozycji („do pomysłów”, „zastosuj”, „pomiń”…) albo jej cofnięcie (`null`). */
export async function PATCH(request: Request) {
  await getCurrentUser()
  const parsed = decision.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'zła decyzja' }, { status: 400 })
  const { tripId, messageId, key, value } = parsed.data
  const where = and(eq(aiMessages.id, messageId), eq(aiMessages.tripId, tripId))
  await getDb()
    .update(aiMessages)
    .set({
      decisions:
        value === null
          ? sql`${aiMessages.decisions} - ${key}`
          : sql`${aiMessages.decisions} || jsonb_build_object(${key}::text, ${value}::text)`,
    })
    .where(where)
  return Response.json({ ok: true })
}

/** Komunikat dla osoby zamiast surowego błędu API. */
function errorMessage(error: unknown, stopped: boolean): string {
  if (stopped) return 'przerwano'
  if (error instanceof Anthropic.RateLimitError)
    return 'AI ma teraz za dużo pytań — spróbuj za chwilę'
  if (error instanceof Anthropic.APIConnectionError)
    return 'brak połączenia z AI — spróbuj ponownie'
  if (error instanceof Anthropic.APIError && (error.status === 529 || (error.status ?? 0) >= 500))
    return 'AI jest przeciążone — spróbuj za chwilę'
  return 'AI nie odpowiedziało — spróbuj ponownie'
}

/**
 * Pytanie do czatu → odpowiedź strumieniem SSE (event: text | status | proposal | changes | done |
 * error). Pytanie zapisuje się od razu (widzi je druga osoba), odpowiedź po zakończeniu. Odpowiedź
 * nie zależy od połączenia: zamknięcie czatu jej nie przerywa, tylko „stop” (`/api/ai/chat/stop`).
 * Historia wraca do modelu bez bloków rozumowania (sam tekst + opis propozycji), więc opis wyjazdu
 * w prompcie systemowym może się zmieniać między pytaniami bez unieważniania niczego (tylko cache).
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
  // Jedna odpowiedź naraz: inaczej dwa pytania widziałyby historię bez siebie nawzajem.
  const busy = activeRun(tripId)
  if (busy)
    return Response.json(
      { error: `${busy.userName} właśnie pyta — poczekaj na odpowiedź` },
      { status: 409 },
    )
  const run = startRun(tripId, user.name)

  const db = getDb()
  let doc: Awaited<ReturnType<typeof loadTripDoc>>
  let context: string
  let history: { role: 'user' | 'assistant'; content: unknown[] }[]
  let questionId: string | undefined
  const prompt = `[teraz: ${nowInTrip(trip.timezone)} · pyta: ${user.name}]\n${message}`
  try {
    doc = await loadTripDoc(tripId)
    context = await tripContextFor(trip, doc)
    const live = and(eq(aiMessages.tripId, tripId), eq(aiMessages.archived, false))
    const [count] = await db.select({ n: sql<number>`count(*)::int` }).from(aiMessages).where(live)
    const total = count?.n ?? 0
    const skip = Math.max(0, Math.floor((total - HISTORY_STEP) / HISTORY_STEP) * HISTORY_STEP)
    history = await db
      .select({ role: aiMessages.role, content: aiMessages.content })
      .from(aiMessages)
      .where(live)
      .orderBy(...chronological)
      .offset(skip)
    // Ucięta historia musi zaczynać się od pytania.
    while (history[0]?.role === 'assistant') history.shift()
    const [row] = await db
      .insert(aiMessages)
      .values({
        tripId,
        userId: user.id,
        role: 'user',
        content: [{ type: 'text', text: prompt }],
        text: message,
        createdAt: new Date(),
      })
      .returning({ id: aiMessages.id })
    questionId = row?.id
  } catch (error) {
    endRun(tripId, run)
    throw error
  }
  const turn: Param[] = [{ role: 'user', content: [{ type: 'text', text: prompt }] }]

  const encoder = new TextEncoder()
  let connected = true
  const stream = new ReadableStream({
    start(controller) {
      // Po zamknięciu czatu zapis do strumienia rzuca błędem — odpowiedź liczy się dalej.
      const send = (event: string, data: unknown) => {
        if (!connected) return
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
        } catch {
          connected = false
        }
      }
      const ping = setInterval(() => {
        if (!connected) return
        try {
          controller.enqueue(encoder.encode(': ping\n\n'))
        } catch {
          connected = false
        }
      }, PING_MS)
      void answerInBackground(send).finally(() => {
        clearInterval(ping)
        if (!connected) return
        try {
          controller.close()
        } catch {}
      })
    },
    cancel() {
      connected = false
    },
  })

  async function answerInBackground(send: (event: string, data: unknown) => void) {
    let answer = ''
    const sources = new Map<string, string>()
    const proposed: CardProposal[] = []
    const changed: CardChange[] = []
    const signal = run.controller.signal
    let current: ReturnType<ReturnType<typeof anthropic>['beta']['messages']['stream']> | undefined
    let failure: unknown
    try {
      for (let round = 0; round < MAX_ROUNDS; round++) {
        // Długie pytanie (kilka rund z wyszukiwaniem) nie przekracza limitu po cichu.
        if (round > 0 && (await budgetLeftPln()) <= 0) {
          const note = '\n\n_(limit AI na ten miesiąc się skończył — przerwano)_'
          answer += note
          send('text', { delta: note })
          break
        }
        const s = anthropic().beta.messages.stream(
          {
            model: AI_MODEL,
            max_tokens: 16000,
            ...fallback(),
            // Czat nie potrzebuje głębokiego rozumowania; low to też niższy koszt.
            output_config: { effort: 'low' },
            // Cache także historii: kolejne rundy tego pytania i następne pytania czytają ją z cache.
            cache_control: { type: 'ephemeral' },
            system: [
              { type: 'text', text: CHAT_INSTRUCTIONS },
              { type: 'text', text: context, cache_control: { type: 'ephemeral' } },
            ],
            tools: [WEB_SEARCH, READ_ATTACHMENT, PROPOSE_CARDS, PROPOSE_CHANGES],
            messages: [
              ...(history.map((h) => ({ role: h.role, content: h.content })) as Param[]),
              ...turn,
            ],
          },
          { signal },
        )
        current = s
        s.on('text', (delta) => {
          answer += delta
          send('text', { delta })
        })
        const msg = await s.finalMessage()
        current = undefined
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
        if (msg.stop_reason !== 'tool_use') {
          if (msg.stop_reason === 'max_tokens') {
            answer += CUT_NOTE
            send('text', { delta: CUT_NOTE })
          }
          break
        }

        const calls = msg.content.filter(
          (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use',
        )
        const results: Anthropic.Beta.BetaToolResultBlockParam[] = []
        for (const call of calls) {
          if (call.name === 'propose_cards') {
            const cards = normalizeProposals(call.input, trip as NonNullable<typeof trip>)
            send('status', { text: 'szukam miejsc na mapie…' })
            // Kolejno, nie równolegle: Nominatim przyjmuje jedno zapytanie na sekundę.
            for (const card of cards) {
              const location = await locate(card.place, card.address)
              if (location) card.location = location
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
          if (call.name === 'propose_changes') {
            const changes = normalizeChanges(
              call.input,
              readCards(doc),
              trip as NonNullable<typeof trip>,
            )
            for (const change of changes) {
              if (!change.place && !change.address) continue
              const location = await locate(change.place, change.address)
              if (location) change.location = location
            }
            changed.push(...changes)
            send('changes', { changes })
            results.push({
              type: 'tool_result',
              tool_use_id: call.id,
              content: `Pokazano zmian: ${changes.length}. Czekają na zatwierdzenie osoby — plan jeszcze się nie zmienił.`,
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
        // Ostatnia runda skończyła się na narzędziu: podsumowania już nie będzie.
        if (round === MAX_ROUNDS - 1) {
          answer += CUT_NOTE
          send('text', { delta: CUT_NOTE })
          break
        }
        if (answer && !answer.endsWith('\n')) {
          answer += '\n\n'
          send('text', { delta: '\n\n' })
        }
      }
    } catch (error) {
      failure = error
      // Przerwana runda też kosztuje: zapisujemy zużycie z tego, co już przyszło.
      const partial = current?.currentMessage
      if (partial)
        await recordUsage({
          userId: user.id,
          kind: 'chat',
          model: partial.model,
          usage: partial.usage,
        }).catch(() => {})
      if (!signal.aborted) console.warn('[ai] czat', String(error))
    }

    const stopped = signal.aborted
    try {
      if (failure && !answer.trim() && !proposed.length && !changed.length) {
        // Nic nie przyszło: pytanie znika z historii, żeby „ponów” go nie dublowało.
        if (questionId) await db.delete(aiMessages).where(eq(aiMessages.id, questionId))
        send('error', { message: errorMessage(failure, stopped), retry: !stopped })
        return
      }
      const text =
        (answer.trim() || '(brak odpowiedzi)') +
        (failure ? `\n\n_(${errorMessage(failure, stopped)})_` : '')
      const list = [...sources].map(([url, title]) => ({ url, title })).slice(0, 8)
      const summary = proposalsSummary(proposed, changed)
      const [saved] = await db
        .insert(aiMessages)
        .values({
          tripId,
          userId: null,
          role: 'assistant',
          content: [{ type: 'text', text: summary ? `${text}\n\n${summary}` : text }],
          text,
          sources: list,
          proposals: proposed,
          changes: changed,
          createdAt: new Date(),
        })
        .returning({ id: aiMessages.id })
      send('done', {
        id: saved?.id,
        questionId,
        sources: list,
        stopped,
        budget: { spent: await spentThisMonthPln(), limit: MONTHLY_BUDGET_PLN },
      })
    } catch (error) {
      console.warn('[ai] czat zapis', String(error))
      send('error', { message: 'nie udało się zapisać odpowiedzi', retry: true })
    } finally {
      endRun(tripId, run)
    }
  }

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
      'x-accel-buffering': 'no',
    },
  })
}

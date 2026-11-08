'use client'

import {
  applyCardChange,
  CARD_STATUS_LABELS,
  CARD_TYPE_LABELS,
  type CardChange,
  type CardProposal,
  type CardSnapshot,
  createCard,
  formatAmount,
  formatShortDate,
  matchingCard,
  type ProposalDecision,
  proposalText,
  todayLocal,
  undoable,
} from '@planer/core'
import { Check, RotateCcw, Send, Sparkles, Square, X } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { Fragment, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { useKeyboardInset } from '@/components/card/format-toolbar'
import { TYPE_STYLE } from '@/components/card/type-style'
import { askConfirm } from '@/components/confirm-dialog'
import { cx } from '@/components/ui'
import { chatSuggestions } from '@/lib/chat-suggestions'
import { offerUndo } from '@/lib/undo'
import { useDismiss } from '@/lib/use-dismiss'
import { useHideWhenInactive } from '@/lib/use-hide-when-inactive'
import { useWide } from '@/lib/use-wide'
import { useCards, useTrip } from '@/lib/yjs/trip-doc'
import { AiMarkdown } from './markdown'

type Msg = {
  /** Identyfikator z bazy; świeże wiadomości mają lokalny, aż serwer je zapisze (`saved`). */
  id: string
  saved: boolean
  role: 'user' | 'assistant'
  text: string
  sources: { title: string; url: string }[]
  author?: string | null
  proposals?: CardProposal[]
  changes?: CardChange[]
  decisions?: Record<string, ProposalDecision>
  createdAt: string
}
type Budget = { spent: number; limit: number }
type Pending = { author: string; startedAt: number }
type ServerMsg = Omit<Msg, 'saved'>
type Setter = (key: string, value: ProposalDecision | null) => void

const DECISION_LABELS: Record<ProposalDecision, string> = {
  idea: 'dodano do pomysłów',
  plan: 'dodano do planu',
  applied: 'zastosowano',
  skipped: 'pominięto',
}
// Odświeżanie rozmowy przy otwartym czacie (pytania drugiej osoby) i przy cudzej odpowiedzi w toku.
const REFRESH_MS = 15_000
const PENDING_MS = 3_000
// Rozmowa na telefonie do czytania bez zasięgu: ostatnie wiadomości wyjazdu.
const OFFLINE_KEY = (tripId: string) => `planer-chat-${tripId}`
const OFFLINE_MAX = 60

/** Rozmowa wyjazdu w pamięci karty przeglądarki: ponowne otwarcie czatu pokazuje ją od razu. */
const memory = new Map<string, Msg[]>()

function readOffline(tripId: string): Msg[] {
  try {
    return JSON.parse(localStorage.getItem(OFFLINE_KEY(tripId)) ?? '[]') as Msg[]
  } catch {
    return []
  }
}
function writeOffline(tripId: string, messages: Msg[]) {
  memory.set(tripId, messages)
  try {
    localStorage.setItem(
      OFFLINE_KEY(tripId),
      JSON.stringify(messages.filter((m) => m.saved).slice(-OFFLINE_MAX)),
    )
  } catch {}
}

const fromServer = (rows: ServerMsg[]): Msg[] => rows.map((m) => ({ ...m, saved: true }))

// Pytanie z innego miejsca aplikacji („ułóż dzień”, „plan B na deszcz”): otwiera czat i od razu je
// wysyła. Odbiera przycisk czatu w widocznym widoku.
let request: { text: string; at: number } | null = null
const requestListeners = new Set<() => void>()
const requestStore = {
  subscribe: (cb: () => void) => {
    requestListeners.add(cb)
    return () => requestListeners.delete(cb)
  },
  get: () => request,
}
export function askChat(text: string) {
  request = { text, at: Date.now() }
  for (const l of requestListeners) l()
}

/** Przycisk czatu w nagłówku wyjazdu. */
export function ChatButton({ onOpenCard }: { onOpenCard: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const wide = useWide()
  // Na telefonie karta z odpowiedzi przykrywa czat; po jej zamknięciu czat wraca.
  const card = useSearchParams().get('card')
  const [reopen, setReopen] = useState(false)
  const sawCard = useRef(false)
  const asked = useSyncExternalStore(requestStore.subscribe, requestStore.get, () => null)
  const [initial, setInitial] = useState<string>()
  useEffect(() => {
    if (!asked) return
    request = null
    setInitial(asked.text)
    setOpen(true)
  }, [asked])
  // Przejście na inny widok zamyka czat; do tego czasu ukryty widok nie zostawia go nad nowym.
  useEffect(() => () => setOpen(false), [])
  const portal = useRef<HTMLDivElement>(null)
  useHideWhenInactive(portal)
  useEffect(() => {
    if (!reopen) return
    if (card) sawCard.current = true
    else if (sawCard.current) {
      sawCard.current = false
      setReopen(false)
      setOpen(true)
    }
  }, [card, reopen])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="czat AI"
        aria-expanded={open}
        className="island flex size-11 shrink-0 items-center justify-center text-muted hover:text-accent aria-expanded:text-accent"
      >
        <Sparkles className="size-5" aria-hidden="true" />
      </button>
      {/* Portal: Tablica tworzy własny kontekst warstw, więc menu dolne przykrywałoby czat. */}
      {open &&
        createPortal(
          <div ref={portal}>
            <ChatPanel
              wide={wide}
              initial={initial}
              onClose={() => {
                setOpen(false)
                setInitial(undefined)
              }}
              onOpenCard={(id) => {
                // Na szerokim ekranie czat stoi z lewej, a karta z prawej — oba naraz.
                if (!wide) {
                  setOpen(false)
                  sawCard.current = false
                  setReopen(true)
                }
                onOpenCard(id)
              }}
            />
          </div>,
          document.body,
        )}
    </>
  )
}

/** Propozycje kart z czatu: osoba decyduje, czy trafią do pomysłów (bez dnia) albo do planu. */
function Proposals({
  cards,
  decisions,
  decide,
}: {
  cards: CardProposal[]
  decisions: Record<string, ProposalDecision>
  decide: Setter
}) {
  const { doc } = useTrip()
  const existing = useCards()
  const create = (card: CardProposal, target: 'idea' | 'plan') => {
    const { type, date, time, durationMin, location, address, booking } = card
    const planned = target === 'plan'
    createCard(
      doc,
      {
        type,
        ...(planned && date && { date }),
        ...(planned && time && { time }),
        ...(durationMin && { durationMin }),
        // Starsze propozycje (sprzed pola adresu) mają adres tylko w polu propozycji.
        ...(location && { location: { ...location, ...(address && { address }) } }),
        ...(booking && { status: 'missing' as const }),
      },
      new Date(),
      proposalText(card),
    )
  }
  // Dodanie od razu, z „cofnij” jak w reszcie planu; cofnięcie zdejmuje też decyzję.
  const add = (indexes: number[], target: 'idea' | 'plan') => {
    const { undo, dispose } = undoable(doc, () => {
      for (const i of indexes) create(cards[i] as CardProposal, target)
    })
    for (const i of indexes) decide(`p${i}`, target)
    const label =
      indexes.length > 1
        ? `dodano do pomysłów · ${indexes.length}`
        : target === 'plan'
          ? 'karta w planie'
          : 'karta w pomysłach'
    offerUndo(
      label,
      () => {
        undo()
        for (const i of indexes) decide(`p${i}`, null)
      },
      dispose,
    )
  }
  const open = cards.map((_, i) => i).filter((i) => !decisions[`p${i}`])

  return (
    <div className="mt-2 flex flex-col gap-1">
      {cards.map((card, i) => {
        const Icon = TYPE_STYLE[card.type].icon
        const state = decisions[`p${i}`]
        const twin = state ? undefined : matchingCard(card, existing)
        const meta = [
          card.date && formatShortDate(card.date),
          card.time,
          card.location?.name,
          card.amount && formatAmount(card.amount),
        ].filter(Boolean)
        const onMap = card.location?.lat !== undefined
        return (
          <section
            key={i}
            className={cx(
              'pop-in rounded-small border border-dashed border-accent p-2',
              state && 'border-solid border-line opacity-60',
            )}
          >
            <p className="flex items-center gap-2 text-sm font-bold">
              <Icon
                className={cx('size-4 shrink-0', TYPE_STYLE[card.type].text)}
                aria-hidden="true"
              />
              <span className="sr-only">{CARD_TYPE_LABELS[card.type]}</span>
              <span className="min-w-0 flex-1 truncate">{card.title}</span>
            </p>
            {meta.length > 0 && (
              <p className="truncate text-xs text-subtle italic">{meta.join(' · ')}</p>
            )}
            {card.address && <p className="truncate text-xs text-subtle">⌖ {card.address}</p>}
            {card.description && <p className="mt-1 text-xs text-text">{card.description}</p>}
            {card.notes && (
              <p className="mt-1 rounded-small bg-raised px-2 py-1 text-xs text-muted">
                <span className="text-subtle italic">uwagi · </span>
                {card.notes}
              </p>
            )}
            {/* Tylko to, co ma skutki: bilety, rezerwacja i brak pinezki na mapie. */}
            {(card.ticketsUrl || card.booking || !onMap) && (
              <p className="mt-1 flex flex-wrap items-center gap-1">
                {card.ticketsUrl && (
                  <a
                    href={card.ticketsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="hit rounded-full border border-accent/50 px-2 py-0.5 text-2xs text-accent"
                  >
                    bilety ›
                  </a>
                )}
                {card.booking && (
                  <span className="rounded-full border border-amber/40 px-2 py-0.5 text-2xs text-amber">
                    do rezerwacji
                  </span>
                )}
                {!onMap && (
                  <span className="text-2xs text-dim">● bez adresu · nie trafi na mapę</span>
                )}
              </p>
            )}
            {twin && (
              <p className="mt-1 truncate text-xs text-orange">
                ● już to masz: {twin.title || 'karta bez tytułu'}
              </p>
            )}
            {state ? (
              <p className="mt-1 flex items-center gap-1 text-xs text-subtle">
                {state !== 'skipped' && <Check className="size-3.5" aria-hidden="true" />}
                {DECISION_LABELS[state]}
              </p>
            ) : (
              <div className={cx('mt-1 grid gap-1', card.date ? 'grid-cols-3' : 'grid-cols-2')}>
                {/* Karta z terminem najpewniej ma trafić do planu, więc to jest główny wybór. */}
                {card.date && (
                  <button
                    type="button"
                    onClick={() => add([i], 'plan')}
                    className="min-h-11 rounded-small bg-accent text-xs font-bold text-on-accent"
                  >
                    do planu · {formatShortDate(card.date)}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => add([i], 'idea')}
                  className={cx(
                    'min-h-11 rounded-small text-xs font-bold',
                    card.date ? 'border border-accent text-accent' : 'bg-accent text-on-accent',
                  )}
                >
                  do pomysłów
                </button>
                <button
                  type="button"
                  onClick={() => decide(`p${i}`, 'skipped')}
                  className="min-h-11 rounded-small border border-line text-xs text-muted"
                >
                  pomiń
                </button>
              </div>
            )}
          </section>
        )
      })}
      {open.length > 1 && (
        <button
          type="button"
          onClick={() => add(open, 'idea')}
          className="min-h-11 text-xs font-bold text-accent"
        >
          wszystkie do pomysłów · {open.length}
        </button>
      )}
    </div>
  )
}

/** Czy karta ma już wszystkie wartości ze zmiany (np. zmieniona ręcznie albo przed zapisem decyzji). */
function changeApplied(change: CardChange, card: CardSnapshot): boolean {
  return (
    (!change.date || card.date === change.date) &&
    (!change.time || card.time === change.time) &&
    (!change.durationMin || card.durationMin === change.durationMin) &&
    (change.status === undefined || (card.status ?? null) === change.status) &&
    (!change.location || card.location?.name === change.location.name) &&
    (!change.appendText || card.preview.includes(change.appendText.split('\n')[0] ?? ''))
  )
}

/** Wiersze „było → będzie” zmiany. */
function changeRows(change: CardChange, card: CardSnapshot): [string, string, string][] {
  const status = (s: CardSnapshot['status'] | null | undefined) =>
    s ? CARD_STATUS_LABELS[s] : 'bez statusu'
  const rows: [string, string, string][] = []
  if (change.date)
    rows.push([
      'dzień',
      card.date ? formatShortDate(card.date) : 'bez dnia',
      formatShortDate(change.date),
    ])
  if (change.time) rows.push(['godzina', card.time ?? '—', change.time])
  if (change.durationMin)
    rows.push([
      'czas',
      card.durationMin ? `${card.durationMin} min` : '—',
      `${change.durationMin} min`,
    ])
  if (change.status !== undefined) rows.push(['status', status(card.status), status(change.status)])
  if (change.location)
    rows.push([
      'miejsce',
      card.location?.name ?? '—',
      [change.location.name, change.location.address].filter(Boolean).join(' · '),
    ])
  if (change.appendText) rows.push(['dopisek', '', change.appendText])
  return rows
}

/** Zmiany istniejących kart od AI: „było → będzie”, a zmienia dopiero „zastosuj” (z „cofnij”). */
function ChangeProposals({
  changes,
  decisions,
  decide,
  onOpenCard,
}: {
  changes: CardChange[]
  decisions: Record<string, ProposalDecision>
  decide: Setter
  onOpenCard: (id: string) => void
}) {
  const { doc } = useTrip()
  const cards = useCards()
  const apply = (i: number, change: CardChange) => {
    const { undo, dispose } = undoable(doc, () => applyCardChange(doc, change))
    decide(`c${i}`, 'applied')
    offerUndo(
      'zmiana zastosowana',
      () => {
        undo()
        decide(`c${i}`, null)
      },
      dispose,
    )
  }
  return (
    <div className="mt-2 flex flex-col gap-1">
      {changes.map((change, i) => {
        const card = cards.find((c) => c.id === change.cardId && !c.deletedAt)
        if (!card) return null
        const state =
          decisions[`c${i}`] ?? (changeApplied(change, card) ? ('applied' as const) : undefined)
        return (
          <section
            key={i}
            className={cx(
              'pop-in rounded-small border border-dashed border-blue p-2',
              state && 'border-solid border-line opacity-60',
            )}
          >
            <p className="flex items-center gap-2 text-sm">
              <span className="text-2xs text-blue">zmiana</span>
              <button
                type="button"
                onClick={() => onOpenCard(card.id)}
                className="min-w-0 flex-1 truncate text-left font-bold hover:text-accent"
              >
                {card.title || 'bez tytułu'}
              </button>
            </p>
            {change.reason && <p className="text-xs text-subtle italic">{change.reason}</p>}
            <ul className="mt-1 flex flex-col gap-0.5 text-xs">
              {changeRows(change, card).map(([label, before, after]) => (
                <li key={label} className="flex gap-2">
                  <span className="w-14 shrink-0 text-subtle">{label}</span>
                  <span className="min-w-0 flex-1 break-words">
                    {before && <span className="text-dim line-through">{before}</span>}
                    {before && ' → '}
                    <span className="text-text">{after}</span>
                  </span>
                </li>
              ))}
            </ul>
            {state ? (
              <p className="mt-1 flex items-center gap-1 text-xs text-subtle">
                {state === 'applied' && <Check className="size-3.5" aria-hidden="true" />}
                {DECISION_LABELS[state]}
              </p>
            ) : (
              <div className="mt-1 grid grid-cols-2 gap-1">
                <button
                  type="button"
                  onClick={() => apply(i, change)}
                  className="min-h-11 rounded-small bg-blue text-xs font-bold text-bg"
                >
                  zastosuj
                </button>
                <button
                  type="button"
                  onClick={() => decide(`c${i}`, 'skipped')}
                  className="min-h-11 rounded-small border border-line text-xs text-muted"
                >
                  pomiń
                </button>
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}

/** „dziś”, „wczoraj” albo „14 lip” nad pierwszą wiadomością dnia. */
function dayLabel(iso: string, today: string): string {
  const day = todayLocal(new Date(iso))
  if (day === today) return 'dziś'
  if (day === todayLocal(new Date(Date.now() - 86_400_000))) return 'wczoraj'
  return formatShortDate(day)
}

function ChatPanel({
  wide,
  initial,
  onClose,
  onOpenCard,
}: {
  wide: boolean
  /** Pytanie do wysłania od razu po wczytaniu rozmowy. */
  initial?: string
  onClose: () => void
  onOpenCard: (id: string) => void
}) {
  const { trip } = useTrip()
  const cards = useCards()
  const [messages, setMessagesState] = useState<Msg[]>(
    () => memory.get(trip.id) ?? readOffline(trip.id),
  )
  const [loaded, setLoaded] = useState(false)
  const [offline, setOffline] = useState(false)
  const [configured, setConfigured] = useState(true)
  const [budget, setBudget] = useState<Budget>()
  const [pending, setPending] = useState<Pending | null>(null)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string>()
  const [error, setError] = useState<{ text: string; retry?: string }>()
  const [announce, setAnnounce] = useState('')
  const list = useRef<HTMLDivElement>(null)
  const field = useRef<HTMLTextAreaElement>(null)
  const atBottom = useRef(true)
  const abort = useRef<AbortController | null>(null)
  // Decyzje przy propozycjach w odpowiedzi, która jeszcze się nie zapisała — wysyłamy po „done”.
  const queued = useRef(new Map<string, [string, ProposalDecision | null][]>())
  const keyboard = useKeyboardInset()
  useDismiss(true, onClose)

  const setMessages = (fn: (m: Msg[]) => Msg[]) =>
    setMessagesState((all) => {
      const next = fn(all)
      writeOffline(trip.id, next)
      return next
    })

  const refresh = async () => {
    const r = await fetch(`/api/ai/chat?tripId=${trip.id}`).catch(() => null)
    if (!r?.ok) {
      setOffline(!navigator.onLine)
      if (navigator.onLine && !memory.get(trip.id)?.length)
        setError({ text: 'nie udało się wczytać rozmowy' })
      return
    }
    const b = (await r.json()) as {
      messages: ServerMsg[]
      configured: boolean
      budget: Budget
      pending: Pending | null
    }
    setOffline(false)
    setConfigured(b.configured)
    setBudget(b.budget)
    setPending(b.pending)
    setMessages(() => fromServer(b.messages))
  }

  const sentInitial = useRef(false)
  useEffect(() => {
    void refresh().finally(() => setLoaded(true))
    return () => abort.current?.abort()
  }, [trip.id])

  // Pytania drugiej osoby i odpowiedź, która dokańcza się w tle (np. po zamknięciu czatu).
  useEffect(() => {
    if (busy || offline) return
    const timer = setInterval(() => void refresh(), pending ? PENDING_MS : REFRESH_MS)
    return () => clearInterval(timer)
  }, [busy, offline, pending, trip.id])

  // Na dół tylko, gdy ktoś już tam jest — czytanie początku długiej odpowiedzi nie skacze.
  useEffect(() => {
    if (atBottom.current) list.current?.scrollTo({ top: list.current.scrollHeight })
  }, [messages, status, pending])

  // Pole rośnie z tekstem (do ok. 5 linii).
  useEffect(() => {
    const el = field.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`
  }, [input])

  const decide = (message: Msg) => (key: string, value: ProposalDecision | null) => {
    setMessages((all) =>
      all.map((m) => {
        if (m.id !== message.id) return m
        const decisions = { ...m.decisions }
        if (value) decisions[key] = value
        else delete decisions[key]
        return { ...m, decisions }
      }),
    )
    const save = (id: string) =>
      void fetch('/api/ai/chat', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tripId: trip.id, messageId: id, key, value }),
      }).catch(() => {})
    if (message.saved) save(message.id)
    else queued.current.set(message.id, [...(queued.current.get(message.id) ?? []), [key, value]])
  }

  const send = async (text: string) => {
    const question = text.trim()
    if (!question || busy) return
    setInput('')
    setError(undefined)
    setBusy(true)
    atBottom.current = true
    const now = new Date().toISOString()
    const askId = `u-${Date.now()}`
    const answerId = `a-${Date.now()}`
    setMessages((m) => [
      ...m,
      { id: askId, saved: false, role: 'user', text: question, sources: [], createdAt: now },
      { id: answerId, saved: false, role: 'assistant', text: '', sources: [], createdAt: now },
    ])
    const patch = (fn: (m: Msg) => Msg) =>
      setMessages((all) => all.map((m) => (m.id === answerId ? fn(m) : m)))
    const drop = () => setMessages((all) => all.filter((m) => m.id !== askId && m.id !== answerId))
    abort.current = new AbortController()
    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tripId: trip.id, message: question }),
        signal: abort.current.signal,
      })
      if (!res.ok || !res.body) {
        const b = await res.json().catch(() => ({}))
        // Pytanie nie poszło: wraca do pola, żeby nie trzeba było pisać od nowa.
        drop()
        setInput(question)
        setError({ text: b.error ?? 'AI nie odpowiedziało' })
        if (res.status === 409) void refresh()
        return
      }
      // Odpowiedź w formacie SSE: event: text|status|proposal|changes|done|error.
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
      let buffer = ''
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += value
        const events = buffer.split('\n\n')
        buffer = events.pop() ?? ''
        for (const raw of events) {
          const event = raw.match(/^event: (.+)$/m)?.[1]
          const data = JSON.parse(raw.match(/^data: (.+)$/m)?.[1] ?? '{}')
          if (event === 'text') {
            setStatus(undefined)
            patch((m) => ({ ...m, text: m.text + data.delta }))
          } else if (event === 'status') setStatus(data.text)
          else if (event === 'proposal')
            patch((m) => ({ ...m, proposals: [...(m.proposals ?? []), ...data.cards] }))
          else if (event === 'changes')
            patch((m) => ({ ...m, changes: [...(m.changes ?? []), ...data.changes] }))
          else if (event === 'done') {
            const waiting = queued.current.get(answerId) ?? []
            queued.current.delete(answerId)
            setMessages((all) =>
              all.map((m) =>
                m.id === answerId
                  ? { ...m, id: data.id ?? m.id, saved: Boolean(data.id), sources: data.sources }
                  : m.id === askId
                    ? { ...m, id: data.questionId ?? m.id, saved: Boolean(data.questionId) }
                    : m,
              ),
            )
            for (const [key, v] of waiting)
              if (data.id)
                void fetch('/api/ai/chat', {
                  method: 'PATCH',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ tripId: trip.id, messageId: data.id, key, value: v }),
                }).catch(() => {})
            setBudget(data.budget)
            setAnnounce(data.stopped ? 'odpowiedź przerwana' : 'odpowiedź gotowa')
          } else if (event === 'error') {
            drop()
            setError({ text: data.message, retry: data.retry ? question : undefined })
          }
        }
      }
    } catch (e) {
      // Zamknięcie czatu przerywa tylko czytanie — serwer dokończy i zapisze odpowiedź.
      if ((e as Error).name !== 'AbortError') {
        drop()
        setError({
          text: navigator.onLine ? 'połączenie przerwane' : 'brak zasięgu',
          retry: question,
        })
        // Serwer mógł dokończyć mimo zerwanego połączenia.
        void refresh()
      }
    } finally {
      setBusy(false)
      setStatus(undefined)
    }
  }

  // Pytanie z przycisku „ułóż dzień” / „plan B”: wysyłamy raz, po wczytaniu rozmowy.
  useEffect(() => {
    if (!loaded || !initial || sentInitial.current || offline) return
    sentInitial.current = true
    void send(initial)
  }, [loaded, initial, offline])

  const stop = () =>
    void fetch('/api/ai/chat/stop', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tripId: trip.id }),
    }).catch(() => {})

  const reset = async () => {
    const ok = await askConfirm({
      title: 'nowa rozmowa?',
      body: 'Dotychczasowa rozmowa przestanie być brana pod uwagę.',
      confirm: 'zacznij od nowa',
    })
    if (!ok) return
    const r = await fetch(`/api/ai/chat?tripId=${trip.id}`, { method: 'DELETE' }).catch(() => null)
    if (r?.ok) setMessages(() => [])
    else setError({ text: 'nie udało się zacząć nowej rozmowy' })
  }

  // Na telefonie Enter to nowa linia (wysyła przycisk), na komputerze wysyła.
  const coarse = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches,
    [],
  )
  const overBudget = Boolean(budget && budget.spent >= budget.limit)
  const blocked = !configured || overBudget || offline
  const today = todayLocal()
  const suggestions = useMemo(() => chatSuggestions(trip, cards, today), [trip, cards, today])
  const exists = (id: string) => cards.some((c) => c.id === id && !c.deletedAt)
  const otherAsking = pending && !busy ? pending : null

  const panel = (
    <section
      className={cx(
        'island flex flex-col overflow-hidden',
        wide ? 'panel-left-in h-full rounded-none border-y-0 border-l-0' : 'sheet-in mx-px mb-px',
      )}
      style={
        wide
          ? undefined
          : {
              height: `calc(85dvh - ${keyboard}px)`,
              marginBottom: keyboard || undefined,
              paddingBottom: keyboard ? 0 : 'env(safe-area-inset-bottom)',
            }
      }
    >
      <header className="flex items-center gap-1 border-b border-line p-1">
        <Sparkles className="ml-2 size-4 text-accent" aria-hidden="true" />
        <h2 className="flex-1 truncate px-1 text-sm font-bold">czat · {trip.title}</h2>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={reset}
            disabled={busy || Boolean(pending)}
            aria-label="nowa rozmowa"
            title="nowa rozmowa"
            className="flex size-11 items-center justify-center text-muted hover:text-accent disabled:opacity-50"
          >
            <RotateCcw className="size-5" aria-hidden="true" />
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="zamknij czat"
          className="flex size-11 items-center justify-center text-muted hover:text-accent"
        >
          <X className="size-5" aria-hidden="true" />
        </button>
      </header>

      <div
        ref={list}
        onScroll={(e) => {
          const el = e.currentTarget
          atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48
        }}
        className="flex flex-1 flex-col gap-3 overflow-y-auto p-3 text-sm leading-relaxed"
      >
        {offline && (
          <p className="text-xs text-subtle italic">
            ● offline · rozmowa do czytania, pytać można po powrocie zasięgu
          </p>
        )}
        {loaded && messages.length === 0 && !offline && (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-subtle italic">
              AI czyta cały plan wyjazdu i pliki, szuka w sieci i proponuje karty — do pomysłów albo
              planu trafiają dopiero po Twoim wyborze.
            </p>
            <div className="flex flex-wrap gap-1">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void send(s)}
                  disabled={blocked || busy}
                  className="min-h-11 rounded-small border border-line px-3 text-left text-xs text-muted hover:text-accent disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => {
          const prev = messages[i - 1]
          const day = dayLabel(m.createdAt, today)
          const newDay = !prev || dayLabel(prev.createdAt, today) !== day
          return (
            <Fragment key={m.id}>
              {newDay && (
                <p className="flex items-center gap-2 text-2xs text-dim" aria-hidden="true">
                  <span className="h-px flex-1 bg-line" />
                  {day}
                  <span className="h-px flex-1 bg-line" />
                </p>
              )}
              {m.role === 'user' ? (
                <div className="ml-8 self-end rounded-island bg-active px-3 py-2">
                  {m.author && <p className="text-2xs text-subtle italic">{m.author}</p>}
                  <p className="whitespace-pre-wrap">{m.text}</p>
                </div>
              ) : (
                <div className="mr-4">
                  {m.text ? (
                    <AiMarkdown text={m.text} onCard={onOpenCard} exists={exists} />
                  ) : (
                    <p className="text-subtle italic">{status ?? 'myślę…'}</p>
                  )}
                  {m.proposals && m.proposals.length > 0 && (
                    <Proposals
                      cards={m.proposals}
                      decisions={m.decisions ?? {}}
                      decide={decide(m)}
                    />
                  )}
                  {m.changes && m.changes.length > 0 && (
                    <ChangeProposals
                      changes={m.changes}
                      decisions={m.decisions ?? {}}
                      decide={decide(m)}
                      onOpenCard={onOpenCard}
                    />
                  )}
                  {m.sources.length > 0 && (
                    <ul className="mt-2 flex flex-col gap-0.5 text-2xs">
                      {m.sources.map((s) => (
                        <li key={s.url} className="truncate">
                          <a
                            href={s.url}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="text-teal"
                          >
                            ↗ {s.title || s.url}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </Fragment>
          )
        })}
        {/* Stan pracy w trakcie pisania odpowiedzi (np. „czytam bilet.pdf…”) — w tym samym miejscu. */}
        {busy && status && messages.at(-1)?.text && (
          <p className="text-xs text-subtle italic">{status}</p>
        )}
        {otherAsking && (
          <p className="text-xs text-subtle italic">
            {otherAsking.author} pyta · odpowiedź w drodze…
          </p>
        )}
        {error && (
          <p className="flex items-center gap-2 text-xs text-red">
            <span className="flex-1">● {error.text}</span>
            {error.retry && (
              <button
                type="button"
                onClick={() => void send(error.retry as string)}
                disabled={busy}
                className="min-h-11 px-2 font-bold text-accent"
              >
                ponów
              </button>
            )}
          </p>
        )}
        {!configured && (
          <p className="text-xs text-muted">● AI nie jest skonfigurowane na serwerze (klucz API)</p>
        )}
        <p className="sr-only" aria-live="polite">
          {announce}
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (busy) stop()
          else void send(input)
        }}
        className="flex items-end gap-1 border-t border-line p-1"
      >
        <textarea
          ref={field}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing || coarse) return
            e.preventDefault()
            void send(input)
          }}
          rows={1}
          maxLength={4000}
          aria-label="pytanie do AI"
          placeholder={
            overBudget
              ? 'limit AI na ten miesiąc wyczerpany'
              : offline
                ? 'czat działa tylko z zasięgiem'
                : 'zapytaj o plan…'
          }
          disabled={blocked}
          className="max-h-32 min-h-11 flex-1 resize-none rounded-small border border-line bg-raised px-3 py-2.5 text-text placeholder:text-dim focus:border-accent focus:outline-none"
        />
        {busy ? (
          <button
            type="submit"
            aria-label="zatrzymaj odpowiedź"
            title="zatrzymaj"
            className="flex size-11 shrink-0 items-center justify-center rounded-small border border-line text-text hover:text-red"
          >
            <Square className="size-4 fill-current" aria-hidden="true" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim() || blocked || Boolean(otherAsking)}
            aria-label="wyślij"
            className="flex size-11 shrink-0 items-center justify-center rounded-small bg-accent text-on-accent disabled:opacity-50"
          >
            <Send className="size-4" aria-hidden="true" />
          </button>
        )}
      </form>
      {/* Koszt widać dopiero, gdy zaczyna mieć znaczenie; całość jest w ustawieniach. */}
      {budget && budget.spent >= budget.limit / 2 && (
        <p className="px-3 pb-2 text-2xs text-dim">
          AI w tym miesiącu:{' '}
          {formatAmount({ value: Math.round(budget.spent * 100) / 100, currency: 'PLN' })} z{' '}
          {formatAmount({ value: budget.limit, currency: 'PLN' })}
        </p>
      )}
    </section>
  )

  // Na szerokim ekranie panel z lewej obok planu (karta otwiera się z prawej), bez przyciemnienia.
  if (wide)
    return (
      <div
        role="dialog"
        aria-label="czat AI"
        className="fixed inset-y-0 left-0 z-(--z-panel) flex w-[420px] flex-col"
      >
        {panel}
      </div>
    )
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="czat AI"
      className="fade-in fixed inset-0 z-(--z-panel) flex flex-col bg-bg/70"
    >
      <button
        type="button"
        aria-label="zamknij czat"
        onClick={onClose}
        className="min-h-12 flex-1"
      />
      {panel}
    </div>
  )
}

'use client'

import { formatAmount } from '@planer/core'
import { RotateCcw, Send, Sparkles, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { cx } from '@/components/ui'
import { useTrip } from '@/lib/yjs/trip-doc'
import { AiMarkdown } from './markdown'

type Msg = {
  id: string
  role: 'user' | 'assistant'
  text: string
  sources: { title: string; url: string }[]
  author?: string | null
}
type Budget = { spent: number; limit: number }

const SUGGESTIONS = [
  'Co mamy jutro?',
  'Czy zdążymy z lotniska do hotelu?',
  'Czego brakuje w planie?',
  'Ile wydaliśmy na jedzenie?',
]

/** Przycisk czatu w nagłówku wyjazdu. */
export function ChatButton({ onOpenCard }: { onOpenCard: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="czat AI"
        className="island flex size-11 shrink-0 items-center justify-center text-muted hover:text-accent"
      >
        <Sparkles className="size-5" aria-hidden="true" />
      </button>
      {open && (
        <ChatPanel
          onClose={() => setOpen(false)}
          onOpenCard={(id) => {
            setOpen(false)
            onOpenCard(id)
          }}
        />
      )}
    </>
  )
}

function ChatPanel({
  onClose,
  onOpenCard,
}: {
  onClose: () => void
  onOpenCard: (id: string) => void
}) {
  const { trip } = useTrip()
  const [messages, setMessages] = useState<Msg[]>([])
  const [loaded, setLoaded] = useState(false)
  const [configured, setConfigured] = useState(true)
  const [budget, setBudget] = useState<Budget>()
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string>()
  const [error, setError] = useState<string>()
  const list = useRef<HTMLDivElement>(null)
  const abort = useRef<AbortController | null>(null)

  useEffect(() => {
    void fetch(`/api/ai/chat?tripId=${trip.id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((b: { messages: Msg[]; configured: boolean; budget: Budget }) => {
        setMessages(b.messages)
        setConfigured(b.configured)
        setBudget(b.budget)
      })
      .catch(() =>
        setError(
          navigator.onLine ? 'nie udało się wczytać rozmowy' : 'czat działa tylko z zasięgiem',
        ),
      )
      .finally(() => setLoaded(true))
    return () => abort.current?.abort()
  }, [trip.id])

  // Przewijanie na dół przy każdej nowej treści odpowiedzi.
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight })
  }, [messages, status])

  const send = async (text: string) => {
    const question = text.trim()
    if (!question || busy) return
    setInput('')
    setError(undefined)
    setBusy(true)
    const answerId = `a-${Date.now()}`
    setMessages((m) => [
      ...m,
      { id: `u-${Date.now()}`, role: 'user', text: question, sources: [] },
      { id: answerId, role: 'assistant', text: '', sources: [] },
    ])
    const patch = (fn: (m: Msg) => Msg) =>
      setMessages((all) => all.map((m) => (m.id === answerId ? fn(m) : m)))
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
        throw new Error(b.error ?? 'AI nie odpowiedziało')
      }
      // Odpowiedź w formacie SSE: event: text|status|done|error.
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
          else if (event === 'done') {
            patch((m) => ({ ...m, sources: data.sources }))
            setBudget(data.budget)
          } else if (event === 'error') throw new Error(data.message)
        }
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        setError((e as Error).message || 'AI nie odpowiedziało')
        setMessages((all) => all.filter((m) => m.id !== answerId || m.text))
      }
    } finally {
      setBusy(false)
      setStatus(undefined)
    }
  }

  const reset = async () => {
    if (!window.confirm('Zacząć nową rozmowę? Dotychczasowa przestanie być brana pod uwagę.'))
      return
    await fetch(`/api/ai/chat?tripId=${trip.id}`, { method: 'DELETE' }).catch(() => {})
    setMessages([])
  }

  const overBudget = budget && budget.spent >= budget.limit

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="czat AI"
      className="fixed inset-0 z-[45] flex flex-col bg-bg/70"
    >
      <button
        type="button"
        aria-label="zamknij czat"
        onClick={onClose}
        className="min-h-12 flex-1"
      />
      <section className="island mx-0.5 mb-0.5 flex h-[85dvh] flex-col overflow-hidden">
        <header className="flex items-center gap-1 border-b border-line p-1">
          <Sparkles className="ml-2 size-4 text-accent" aria-hidden="true" />
          <h2 className="flex-1 truncate px-1 text-sm font-bold">czat · {trip.title}</h2>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={reset}
              aria-label="nowa rozmowa"
              title="nowa rozmowa"
              className="flex size-11 items-center justify-center text-muted hover:text-accent"
            >
              <RotateCcw className="size-4" aria-hidden="true" />
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
          className="flex flex-1 flex-col gap-3 overflow-y-auto p-3 text-[14px] leading-relaxed"
        >
          {loaded && messages.length === 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-subtle italic">
                AI czyta cały plan wyjazdu i pliki, szuka w sieci — niczego nie zmienia.
              </p>
              <div className="flex flex-wrap gap-1">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => void send(s)}
                    disabled={!configured || busy}
                    className="min-h-9 rounded-small border border-line px-3 text-xs text-muted hover:text-accent"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m) =>
            m.role === 'user' ? (
              <div key={m.id} className="ml-8 self-end rounded-island bg-accent/15 px-3 py-2">
                {m.author && <p className="text-[11px] text-subtle italic">{m.author}</p>}
                <p className="whitespace-pre-wrap">{m.text}</p>
              </div>
            ) : (
              <div key={m.id} className="mr-4">
                {m.text ? (
                  <AiMarkdown text={m.text} onCard={onOpenCard} />
                ) : (
                  <p className="text-subtle italic">myślę…</p>
                )}
                {m.sources.length > 0 && (
                  <ul className="mt-2 flex flex-col gap-0.5 text-[11px]">
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
            ),
          )}
          {status && <p className="text-xs text-subtle italic">● {status}</p>}
          {error && <p className="text-xs text-red">● {error}</p>}
          {!configured && (
            <p className="text-xs text-muted">
              ● AI nie jest skonfigurowane na serwerze (klucz API)
            </p>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            void send(input)
          }}
          className="flex items-end gap-1 border-t border-line p-1"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void send(input)
              }
            }}
            rows={1}
            maxLength={4000}
            placeholder={overBudget ? 'limit AI na ten miesiąc wyczerpany' : 'zapytaj o plan…'}
            disabled={!configured || Boolean(overBudget)}
            className="max-h-32 min-h-11 flex-1 resize-none rounded-small border border-line bg-raised px-3 py-2.5 text-text placeholder:text-dim focus:border-accent focus:outline-none"
          />
          <button
            type="submit"
            disabled={busy || !input.trim() || !configured}
            aria-label="wyślij"
            className={cx(
              'flex size-11 shrink-0 items-center justify-center rounded-small bg-accent text-on-accent',
              (busy || !input.trim()) && 'opacity-50',
            )}
          >
            <Send className="size-4" aria-hidden="true" />
          </button>
        </form>
        {budget && (
          <p className="px-3 pb-2 text-[11px] text-dim">
            AI w tym miesiącu:{' '}
            {formatAmount({ value: Math.round(budget.spent * 100) / 100, currency: 'PLN' })} z{' '}
            {formatAmount({ value: budget.limit, currency: 'PLN' })}
          </p>
        )}
      </section>
    </div>
  )
}

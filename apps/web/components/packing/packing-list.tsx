'use client'

import {
  addPackingItem,
  copyPacking,
  PACKING_CATEGORIES,
  type PackingCategory,
  type PackingItem,
  removePackingItem,
  updatePackingItem,
} from '@planer/core'
import { Check, ChevronRight, Copy, Luggage, X } from 'lucide-react'
import Link from 'next/link'
import { type FormEvent, useMemo, useState } from 'react'
import { TopBar } from '@/components/top-bar'
import { TripStatus } from '@/components/trip-status'
import { cx, inputClass, SectionLabel } from '@/components/ui'
import { withUndo } from '@/lib/undo'
import { usePacking, useTrip } from '@/lib/yjs/trip-doc'

type Source = { tripId: string; title: string; startDate: string | null; items: PackingItem[] }
type Filter = 'all' | 'mine' | 'todo'

/** Lista pakowania wyjazdu: wspólna, z podziałem „kto bierze”, działa offline. */
export function PackingList({ people }: { people: string[] }) {
  const { trip, doc, user, ready } = useTrip()
  const items = usePacking()
  const [text, setText] = useState('')
  const [category, setCategory] = useState<PackingCategory>('inne')
  const [owner, setOwner] = useState<string | undefined>(undefined)
  const [filter, setFilter] = useState<Filter>('all')
  const [sources, setSources] = useState<Source[] | null>(null)
  const others = people.filter((p) => p !== user.name)

  const shown = useMemo(
    () =>
      items.filter(
        (i) =>
          (filter !== 'mine' || i.owner === user.name || !i.owner) &&
          (filter !== 'todo' || !i.packed),
      ),
    [items, filter, user.name],
  )
  const packed = items.filter((i) => i.packed).length

  const add = (e: FormEvent) => {
    e.preventDefault()
    // Kilka rzeczy naraz po przecinku: „krem, okulary, czapka”.
    for (const part of text
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean))
      addPackingItem(doc, { text: part, category, owner })
    setText('')
  }

  const loadSources = async () => {
    const res = await fetch(`/api/packing?tripId=${trip.id}`).catch(() => null)
    setSources(res?.ok ? ((await res.json()) as { sources: Source[] }).sources : [])
  }

  const ownerLabel = (name?: string) => (!name ? 'wspólne' : name === user.name ? 'ja' : name)

  return (
    <>
      <TopBar
        title="lista pakowania"
        back={{ href: `/trips/${trip.id}/today`, label: 'wróć do wyjazdu' }}
        actions={<TripStatus />}
      />

      {items.length > 0 && (
        <div className="island mt-1 flex flex-col gap-2 p-3">
          <p className="flex items-baseline justify-between text-sm">
            <span>
              spakowane <b>{packed}</b> z {items.length}
            </span>
            {packed === items.length && <span className="text-xs text-green">• wszystko</span>}
          </p>
          <div className="h-1 overflow-hidden rounded-full bg-raised" aria-hidden="true">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-300"
              style={{ width: `${(packed / items.length) * 100}%` }}
            />
          </div>
          <div className="flex gap-1" role="group" aria-label="pokaż">
            {(
              [
                ['all', 'wszystko'],
                ['mine', 'moje i wspólne'],
                ['todo', 'do spakowania'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={filter === key}
                onClick={() => setFilter(key)}
                className={cx(
                  'min-h-11 rounded-small px-3 text-xs',
                  filter === key ? 'bg-active font-bold text-accent' : 'text-muted',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      <form onSubmit={add} className="island mt-1 flex flex-col gap-2 p-2">
        <div className="flex gap-1">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="dodaj rzeczy, np. paszport, ładowarka"
            aria-label="nowa rzecz"
            enterKeyHint="done"
            className={inputClass}
          />
          <button
            type="submit"
            disabled={!text.trim()}
            className="min-h-11 shrink-0 rounded-small bg-accent px-4 text-sm font-bold text-on-accent disabled:opacity-50"
          >
            dodaj
          </button>
        </div>
        <div className="flex flex-wrap gap-1" role="group" aria-label="kategoria">
          {PACKING_CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={category === c}
              onClick={() => setCategory(c)}
              className={cx(
                'hit min-h-9 rounded-small border px-3 text-xs',
                category === c ? 'border-accent bg-active text-accent' : 'border-line text-muted',
              )}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="kto bierze">
          <span className="px-1 text-xs text-subtle italic">kto bierze</span>
          {[undefined, user.name, ...others].map((name) => (
            <button
              key={name ?? 'wspólne'}
              type="button"
              aria-pressed={owner === name}
              onClick={() => setOwner(name)}
              className={cx(
                'hit min-h-9 rounded-small border px-3 text-xs',
                owner === name ? 'border-accent bg-active text-accent' : 'border-line text-muted',
              )}
            >
              {ownerLabel(name)}
            </button>
          ))}
        </div>
      </form>

      {ready && items.length === 0 && (
        <div className="island mt-1 flex flex-col gap-2 p-4 text-sm">
          <p className="text-muted">
            Lista jest pusta. Dodaj rzeczy albo zacznij od listy z innego wyjazdu.
          </p>
          {sources === null ? (
            <button
              type="button"
              onClick={() => void loadSources()}
              className="flex min-h-11 items-center gap-2 self-start rounded-small border border-line px-3 text-muted hover:text-accent"
            >
              <Copy className="size-4" aria-hidden="true" /> z poprzedniego wyjazdu
            </button>
          ) : sources.length === 0 ? (
            <p className="text-xs text-subtle italic">● inne wyjazdy nie mają list pakowania</p>
          ) : (
            <div className="flex flex-col gap-1">
              {sources.map((s) => (
                <button
                  key={s.tripId}
                  type="button"
                  onClick={() =>
                    withUndo(doc, `skopiowano · ${s.items.length}`, () => copyPacking(doc, s.items))
                  }
                  className="flex min-h-11 items-center gap-2 rounded-small px-3 text-left hover:bg-raised"
                >
                  <Copy className="size-4 text-muted" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{s.title}</span>
                  <span className="text-xs text-subtle">{s.items.length} rzeczy</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {PACKING_CATEGORIES.map((c) => {
        const group = shown.filter((i) => i.category === c)
        if (!group.length) return null
        return (
          <section key={c} className="flex flex-col gap-1">
            <SectionLabel>
              {c} · {group.filter((i) => i.packed).length}/{group.length}
            </SectionLabel>
            <ul className="island flex flex-col p-1">
              {group.map((item) => (
                <li key={item.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={item.packed}
                    onClick={() => updatePackingItem(doc, item.id, { packed: !item.packed })}
                    className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-inner px-2 text-left hover:bg-raised"
                  >
                    <span
                      className={cx(
                        'flex size-6 shrink-0 items-center justify-center rounded-small border transition-colors',
                        item.packed ? 'border-accent bg-accent text-on-accent' : 'border-line',
                      )}
                    >
                      {item.packed && <Check className="size-4" aria-hidden="true" />}
                    </span>
                    <span
                      className={cx(
                        'min-w-0 flex-1 truncate',
                        item.packed && 'text-subtle line-through',
                      )}
                    >
                      {item.text}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      // Kolejno: wspólne → ja → druga osoba → wspólne.
                      const order = [undefined, user.name, ...others]
                      const next = order[(order.indexOf(item.owner) + 1) % order.length]
                      updatePackingItem(doc, item.id, { owner: next })
                    }}
                    aria-label={`kto bierze: ${ownerLabel(item.owner)}, zmień`}
                    className={cx(
                      'min-h-11 shrink-0 px-2 text-xs',
                      item.owner === user.name ? 'font-bold text-accent' : 'text-subtle italic',
                    )}
                  >
                    {ownerLabel(item.owner)}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      withUndo(doc, `usunięto: ${item.text}`, () => removePackingItem(doc, item.id))
                    }
                    aria-label={`usuń ${item.text}`}
                    className="flex size-11 shrink-0 items-center justify-center text-dim hover:text-red"
                  >
                    <X className="size-4" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </>
  )
}

/** Postęp pakowania w „dziś” przed wyjazdem; prowadzi do listy. */
export function PackingProgress() {
  const { trip } = useTrip()
  const items = usePacking()
  const packed = items.filter((i) => i.packed).length
  return (
    <Link
      href={`/trips/${trip.id}/packing`}
      className="island flex min-h-11 items-center gap-2 px-3 text-sm hover:border-accent"
    >
      <Luggage className="size-5 text-accent" aria-hidden="true" />
      <span className="font-bold">lista pakowania</span>
      <span className="text-xs text-subtle italic">
        {items.length ? `spakowane ${packed} z ${items.length}` : 'jeszcze pusta'}
      </span>
      <ChevronRight className="ml-auto size-4 text-muted" aria-hidden="true" />
    </Link>
  )
}

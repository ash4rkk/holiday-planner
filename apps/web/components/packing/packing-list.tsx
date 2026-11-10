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
import { ArrowUp, Check, ChevronDown, ChevronRight, Copy, Luggage, X } from 'lucide-react'
import { type FormEvent, type KeyboardEvent, type PointerEvent, useEffect, useState } from 'react'
import { cx } from '@/components/ui'
import { withUndo } from '@/lib/undo'
import { openPacking } from '@/lib/use-packing-drawer'
import { usePacking, useTrip } from '@/lib/yjs/trip-doc'
import { Bar, CATEGORY_ICON, nextOwner, OwnerDot, ownerLabel, Ring } from './packing-ui'

type Source = { tripId: string; title: string; startDate: string | null; items: PackingItem[] }

// Przyciski obok edytowanego pola nie zabierają mu fokusu — klawiatura zostaje otwarta.
const keepFocus = (e: PointerEvent) => e.preventDefault()

/**
 * Lista pakowania wyjazdu (treść drawera). U góry pierścień postępu z podziałem na osoby, pod nim
 * kategorie jako chipy; lista pokazuje to, co zostało, spakowane chowają się na dole. Dodawanie w
 * pływającym polu (osoba, kategoria, kilka rzeczy po przecinku), dotknięcie nazwy ją poprawia.
 * Wspólna dla obu osób, działa offline.
 */
export function PackingList({ people }: { people: string[] }) {
  const { trip, doc, user, ready } = useTrip()
  const me = user.name
  const items = usePacking()
  const [filter, setFilter] = useState<PackingCategory | 'all'>('all')
  const [text, setText] = useState('')
  const [owner, setOwner] = useState<string | undefined>(undefined)
  // Kategoria nowych rzeczy, gdy widać wszystkie; przy wybranym chipie — ta z chipa.
  const [newCategory, setNewCategory] = useState<PackingCategory>('inne')
  const [picking, setPicking] = useState(false)
  const [showPacked, setShowPacked] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [sources, setSources] = useState<Source[] | null>(null)

  const packed = items.filter((i) => i.packed).length
  const shown = filter === 'all' ? items : items.filter((i) => i.category === filter)
  const todo = shown.filter((i) => !i.packed)
  const done = shown.filter((i) => i.packed)
  const owners = [me, ...people.filter((p) => p !== me), undefined]
  const category = filter === 'all' ? newCategory : filter

  // Wybrana kategoria zniknęła (ostatnią rzecz przeniesiono albo usunięto) — wracamy do całości.
  useEffect(() => {
    if (filter !== 'all' && !items.some((i) => i.category === filter)) setFilter('all')
  }, [filter, items])

  // Pusta lista od razu proponuje listy z innych wyjazdów (offline po prostu ich nie pokaże).
  const empty = ready && items.length === 0
  useEffect(() => {
    if (!empty || sources !== null) return
    let alive = true
    fetch(`/api/packing?tripId=${trip.id}`)
      .then((res) => (res.ok ? (res.json() as Promise<{ sources: Source[] }>) : { sources: [] }))
      .catch(() => ({ sources: [] }))
      .then((data) => alive && setSources(data.sources))
    return () => {
      alive = false
    }
  }, [empty, sources, trip.id])

  const add = (e: FormEvent) => {
    e.preventDefault()
    // Kilka rzeczy naraz po przecinku: „krem, okulary, czapka”.
    for (const part of text
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean))
      addPackingItem(doc, { text: part, category, owner })
    setText('')
    setPicking(false)
  }

  const startEdit = (item: PackingItem) => {
    setEditing(item.id)
    setDraft(item.text)
  }

  /** Zapis poprawionej nazwy; pusta = do kosza (z „cofnij”). */
  const commit = () => {
    const item = items.find((i) => i.id === editing)
    setEditing(null)
    if (!item) return
    const value = draft.trim()
    if (!value) withUndo(doc, `usunięto: ${item.text}`, () => removePackingItem(doc, item.id))
    else if (value !== item.text) updatePackingItem(doc, item.id, { text: value })
  }

  const onEditKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      e.currentTarget.blur()
    } else if (e.key === 'Escape') {
      // Esc cofa poprawkę, a nie zamyka całej listy.
      e.stopPropagation()
      setDraft(items.find((i) => i.id === editing)?.text ?? '')
      setEditing(null)
    }
  }

  const remove = (item: PackingItem) => {
    setEditing(null)
    withUndo(doc, `usunięto: ${item.text}`, () => removePackingItem(doc, item.id))
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain px-1 pb-24 [&>*]:shrink-0">
        {items.length > 0 && (
          <section className="island flex items-center gap-4 p-4" aria-label="postęp">
            <div className="relative">
              <Ring value={packed} total={items.length} />
              <span className="absolute inset-0 flex flex-col items-center justify-center leading-none">
                <b className="text-xl tabular-nums">{packed}</b>
                <span className="text-2xs text-subtle">z {items.length}</span>
              </span>
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <p className="text-sm">
                {packed === items.length ? (
                  <span className="text-green">• wszystko spakowane</span>
                ) : (
                  <>
                    zostało <b className="tabular-nums">{items.length - packed}</b> rzeczy
                  </>
                )}
              </p>
              {owners.map((o) => {
                const theirs = items.filter((i) => i.owner === o)
                const theirsPacked = theirs.filter((i) => i.packed).length
                return (
                  <div key={o ?? 'wspólne'} className="flex items-center gap-2">
                    <OwnerDot me={me} owner={o} size="sm" />
                    <span className="w-14 truncate text-xs text-muted">{ownerLabel(me, o)}</span>
                    <Bar value={theirsPacked} total={theirs.length} className="flex-1" />
                    <span className="w-8 text-right text-2xs tabular-nums text-subtle">
                      {theirsPacked}/{theirs.length}
                    </span>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {items.length > 0 && (
          <div
            className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1"
            role="group"
            aria-label="kategoria"
          >
            {(['all', ...PACKING_CATEGORIES] as const).map((c) => {
              const list = c === 'all' ? items : items.filter((i) => i.category === c)
              if (c !== 'all' && list.length === 0) return null
              const active = filter === c
              const left = list.filter((i) => !i.packed).length
              return (
                <button
                  key={c}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setFilter(c)}
                  className={cx(
                    'flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm transition-colors',
                    active
                      ? 'border-accent bg-active text-accent'
                      : 'border-line bg-panel text-muted',
                  )}
                >
                  {c === 'all' ? 'wszystko' : c}
                  {left > 0 ? (
                    <span
                      className={cx(
                        'text-2xs tabular-nums',
                        active ? 'text-accent' : 'text-subtle',
                      )}
                    >
                      {left}
                    </span>
                  ) : (
                    <Check className="size-3.5 text-green" aria-label="spakowane" />
                  )}
                </button>
              )
            })}
          </div>
        )}

        {empty && sources !== null && sources.length > 0 && (
          <section className="island flex flex-col gap-1 p-1" aria-label="skopiuj listę">
            <p className="px-2 pt-2 pb-1 text-sm text-muted">
              Lista jest pusta — zacznij od listy z innego wyjazdu?
            </p>
            {sources.map((s) => (
              <button
                key={s.tripId}
                type="button"
                onClick={() =>
                  withUndo(doc, `skopiowano · ${s.items.length}`, () => copyPacking(doc, s.items))
                }
                className="flex min-h-11 items-center gap-2 rounded-inner px-2 text-left text-sm hover:bg-raised"
              >
                <Copy className="size-4 shrink-0 text-muted" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{s.title}</span>
                <span className="text-xs text-subtle">{s.items.length} rzeczy ›</span>
              </button>
            ))}
          </section>
        )}
        {!ready && items.length === 0 && (
          <p className="px-3 py-2 text-sm text-subtle">wczytuję listę…</p>
        )}
        {empty && (
          <p className="px-3 py-2 text-sm text-muted">
            Dopisz rzeczy w polu na dole — kilka naraz po przecinku.
          </p>
        )}

        {items.length > 0 && (
          <ul className="island flex flex-col p-1">
            {todo.map((item) =>
              editing === item.id ? (
                <li key={item.id} className="flex flex-col gap-1 rounded-inner bg-raised p-1">
                  <div className="flex items-center gap-1">
                    <input
                      autoFocus
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={onEditKey}
                      onBlur={commit}
                      enterKeyHint="done"
                      aria-label="nazwa rzeczy"
                      placeholder="nazwa (pusta = usuń)"
                      className="min-h-11 min-w-0 flex-1 bg-transparent px-2 outline-none placeholder:text-subtle"
                    />
                    <button
                      type="button"
                      onPointerDown={keepFocus}
                      onClick={() => remove(item)}
                      aria-label={`usuń ${item.text}`}
                      className="flex size-11 shrink-0 items-center justify-center text-subtle hover:text-red"
                    >
                      <X className="size-4" aria-hidden="true" />
                    </button>
                  </div>
                  <div className="flex gap-1 overflow-x-auto" role="group" aria-label="kategoria">
                    {PACKING_CATEGORIES.map((c) => (
                      <button
                        key={c}
                        type="button"
                        aria-pressed={item.category === c}
                        onPointerDown={keepFocus}
                        onClick={() => updatePackingItem(doc, item.id, { category: c })}
                        className={cx(
                          'hit min-h-9 shrink-0 rounded-full border px-3 text-xs',
                          item.category === c
                            ? 'border-accent bg-active text-accent'
                            : 'border-line bg-panel text-muted',
                        )}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </li>
              ) : (
                <li key={item.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={false}
                    aria-label={`spakuj: ${item.text}`}
                    onClick={() => updatePackingItem(doc, item.id, { packed: true })}
                    className="flex size-12 shrink-0 items-center justify-center"
                  >
                    <span className="size-6 rounded-full border-2 border-line transition-colors hover:border-accent" />
                  </button>
                  <button
                    type="button"
                    onClick={() => startEdit(item)}
                    aria-label={`popraw: ${item.text}`}
                    className="flex min-h-12 min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <span className="min-w-0 flex-1 truncate">{item.text}</span>
                    {filter === 'all' && (
                      <span className="shrink-0 text-2xs text-subtle">{item.category}</span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      updatePackingItem(doc, item.id, { owner: nextOwner(people, me, item.owner) })
                    }
                    aria-label={`kto bierze: ${ownerLabel(me, item.owner)}, zmień`}
                    className="flex size-11 shrink-0 items-center justify-center"
                  >
                    <OwnerDot me={me} owner={item.owner} />
                  </button>
                </li>
              ),
            )}
            {todo.length === 0 && (
              <li className="p-3 text-sm text-green">
                • {filter === 'all' ? 'wszystko spakowane' : `${filter}: wszystko spakowane`}
              </li>
            )}
          </ul>
        )}

        {done.length > 0 && (
          <section className="flex flex-col gap-1">
            <button
              type="button"
              onClick={() => setShowPacked((v) => !v)}
              aria-expanded={showPacked}
              className="flex min-h-11 items-center gap-2 px-3 text-sm text-subtle"
            >
              spakowane · {done.length}
              <ChevronDown
                className={cx('size-4 transition-transform', showPacked && 'rotate-180')}
                aria-hidden="true"
              />
            </button>
            {showPacked && (
              <ul className="island fade-in flex flex-col p-1">
                {done.map((item) => (
                  <li key={item.id} className="flex items-center gap-1">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked
                      aria-label={`odpakuj: ${item.text}`}
                      onClick={() => updatePackingItem(doc, item.id, { packed: false })}
                      className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-inner pr-2 text-left text-subtle hover:bg-raised"
                    >
                      <span className="flex size-12 shrink-0 items-center justify-center">
                        <span className="flex size-6 items-center justify-center rounded-full bg-accent text-on-accent">
                          <Check className="size-4" aria-hidden="true" />
                        </span>
                      </span>
                      <span className="truncate line-through">{item.text}</span>
                    </button>
                    <span className="flex size-11 shrink-0 items-center justify-center">
                      <OwnerDot me={me} owner={item.owner} size="sm" />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>

      {picking && filter === 'all' && (
        <div
          className="island shadow-float fade-in absolute inset-x-2 bottom-[calc(max(8px,env(safe-area-inset-bottom))+60px)] flex flex-wrap gap-1 p-2"
          role="group"
          aria-label="kategoria nowych rzeczy"
        >
          {PACKING_CATEGORIES.map((c) => {
            const Icon = CATEGORY_ICON[c]
            return (
              <button
                key={c}
                type="button"
                aria-pressed={newCategory === c}
                onPointerDown={keepFocus}
                onClick={() => {
                  setNewCategory(c)
                  setPicking(false)
                }}
                className={cx(
                  'hit flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs',
                  newCategory === c
                    ? 'border-accent bg-active text-accent'
                    : 'border-line bg-panel text-muted',
                )}
              >
                <Icon className="size-3.5" aria-hidden="true" />
                {c}
              </button>
            )
          })}
        </div>
      )}

      <form
        onSubmit={add}
        className="island shadow-float absolute inset-x-2 bottom-[max(8px,env(safe-area-inset-bottom))] flex items-center gap-1 rounded-full p-1"
      >
        <button
          type="button"
          onPointerDown={keepFocus}
          onClick={() => setOwner(nextOwner(people, me, owner))}
          aria-label={`kto bierze: ${ownerLabel(me, owner)}, zmień`}
          title={`kto bierze: ${ownerLabel(me, owner)}`}
          className="flex size-11 shrink-0 items-center justify-center"
        >
          <OwnerDot me={me} owner={owner} />
        </button>
        {filter === 'all' && (
          <CategoryButton
            category={newCategory}
            open={picking}
            onClick={() => setPicking((v) => !v)}
          />
        )}
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={filter === 'all' ? `dodaj do: ${newCategory}` : `dodaj do: ${filter}`}
          aria-label="nowa rzecz"
          enterKeyHint="send"
          className="min-h-11 min-w-0 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-subtle"
        />
        <button
          type="submit"
          aria-label="dodaj"
          onPointerDown={keepFocus}
          className={cx(
            'flex size-11 shrink-0 items-center justify-center rounded-full transition-colors',
            text.trim() ? 'bg-accent text-on-accent' : 'bg-raised text-subtle',
          )}
        >
          <ArrowUp className="size-5" aria-hidden="true" />
        </button>
      </form>
    </div>
  )
}

function CategoryButton({
  category,
  open,
  onClick,
}: {
  category: PackingCategory
  open: boolean
  onClick: () => void
}) {
  const Icon = CATEGORY_ICON[category]
  return (
    <button
      type="button"
      onPointerDown={keepFocus}
      onClick={onClick}
      aria-expanded={open}
      aria-label={`kategoria: ${category}, zmień`}
      title={category}
      className={cx(
        'flex size-11 shrink-0 items-center justify-center rounded-full transition-colors',
        open ? 'bg-active text-accent' : 'text-muted hover:text-accent',
      )}
    >
      <Icon className="size-5" aria-hidden="true" />
    </button>
  )
}

/** Postęp pakowania w „dziś” przed wyjazdem; otwiera drawer z listą. */
export function PackingProgress() {
  const items = usePacking()
  const packed = items.filter((i) => i.packed).length
  const done = items.length > 0 && packed === items.length
  return (
    <button
      type="button"
      onClick={openPacking}
      className="island flex min-h-11 items-center gap-2 px-3 text-left text-sm hover:border-accent"
    >
      <Luggage className="size-5 text-accent" aria-hidden="true" />
      <span className="font-bold">lista pakowania</span>
      <span className="text-xs text-subtle">
        {items.length ? `spakowane ${packed} z ${items.length}` : 'jeszcze pusta'}
      </span>
      {done && <span className="text-xs text-green">• wszystko</span>}
      <ChevronRight className="ml-auto size-4 text-muted" aria-hidden="true" />
    </button>
  )
}

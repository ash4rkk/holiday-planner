'use client'

import {
  arriveEarlyMin,
  type CardLocation,
  type CardSnapshot,
  type EditableCardFields,
  formatShortDate,
  navigationUrl,
  placeUrl,
} from '@planer/core'
import { Navigation, X } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { MiniMap } from '@/components/map/mini-map'
import { cx, inputClass } from '@/components/ui'
import { resolvePastedPlace } from '@/lib/place-card'
import { formatDuration, formatRemind, REMIND_OPTIONS } from './type-style'

type Key =
  | 'date'
  | 'endDate'
  | 'time'
  | 'durationMin'
  | 'location'
  | 'destination'
  | 'remindMin'
  | 'arriveEarlyMin'
type TimeKey = Exclude<Key, 'location' | 'destination'>

const WHEN: { key: TimeKey; label: string; value: (card: CardSnapshot) => string }[] = [
  { key: 'date', label: 'data', value: (c) => formatShortDate(c.date as string) },
  {
    key: 'endDate',
    label: 'data końcowa',
    value: (c) => `do ${formatShortDate(c.endDate as string)}`,
  },
  { key: 'time', label: 'godzina', value: (c) => c.time as string },
  {
    key: 'durationMin',
    label: 'czas trwania',
    value: (c) => formatDuration(c.durationMin as number),
  },
  { key: 'remindMin', label: 'przypomnienie', value: (c) => formatRemind(c.remindMin as number) },
  {
    key: 'arriveEarlyMin',
    label: 'na miejscu wcześniej',
    value: (c) =>
      c.arriveEarlyMin ? `na miejscu ${formatDuration(c.arriveEarlyMin)} wcześniej` : 'na styk',
  },
]

const EARLY_OPTIONS = [0, 10, 15, 30, 45, 60, 90, 120, 150, 180] as const

/** Zapas przed kartą ma sens przy transporcie (odprawa, peron); przy innych kartach go nie pokazujemy. */
const whenFields = (card: CardSnapshot) =>
  WHEN.filter((f) => f.key !== 'arriveEarlyMin' || card.type === 'transport')

/** Wysepka karty z małą etykietą. */
export function Section({
  label,
  action,
  children,
}: {
  label: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="island flex flex-col gap-1 p-2">
      <div className="flex min-h-6 items-center gap-2">
        <h3 className="flex-1 text-xs text-subtle">{label}</h3>
        {action}
      </div>
      {children}
    </section>
  )
}

const chip = 'min-h-11 rounded-small border px-3 text-xs transition-colors'

/**
 * Pola karty jako wysepki: „kiedy” z chipami (tap otwiera pole pod spodem) i „miejsce”. Dalsze
 * wysepki podaje `children`, a `addons` dokłada chipy na dole.
 */
export function CardSections({
  card,
  onChange,
  children,
  addons,
}: {
  card: CardSnapshot
  onChange: (patch: Partial<EditableCardFields>) => void
  children?: ReactNode
  addons?: ReactNode
}) {
  const [editing, setEditing] = useState<TimeKey | null>(null)
  const [opened, setOpened] = useState<Set<Key>>(new Set())
  const open = (key: Key) => setOpened((s) => new Set(s).add(key))
  const shown = (key: Key) => card[key] !== undefined || opened.has(key)
  const clear = (key: Key) => {
    setEditing(null)
    setOpened((s) => {
      const next = new Set(s)
      next.delete(key)
      return next
    })
    onChange({ [key]: undefined })
  }
  const active = whenFields(card).find((f) => f.key === editing)
  // „Dokąd” ma sens tylko przy transporcie: bez tego nie wiadomo, skąd liczyć następny dojazd.
  const places = [
    { key: 'location' as const, label: 'miejsce' },
    ...(card.type === 'transport' ? [{ key: 'destination' as const, label: 'dokąd' }] : []),
  ]

  return (
    <div className="flex flex-col gap-1">
      <Section label="kiedy">
        <div className="flex flex-wrap gap-1">
          {whenFields(card).map(({ key, label, value }) => {
            const set = card[key] !== undefined
            return (
              <button
                key={key}
                type="button"
                aria-pressed={editing === key}
                onClick={() => setEditing(editing === key ? null : key)}
                className={cx(
                  chip,
                  set
                    ? 'border-accent bg-active text-accent'
                    : 'border-dashed border-line text-muted hover:text-accent',
                )}
              >
                {set ? value(card) : `+ ${label}`}
              </button>
            )
          })}
        </div>
        {active && (
          <Row label={active.label} onClear={() => clear(active.key)}>
            <FieldInput field={active.key} card={card} onChange={onChange} />
          </Row>
        )}
      </Section>

      {places
        .filter((p) => shown(p.key))
        .map(({ key, label }) => (
          <Section
            key={key}
            label={label}
            action={
              <button
                type="button"
                onClick={() => clear(key)}
                aria-label={`usuń pole ${label}`}
                className="-my-2.5 -mr-1.5 flex size-11 items-center justify-center text-subtle hover:text-red"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            }
          >
            <LocationField field={key} card={card} onChange={onChange} />
          </Section>
        ))}

      {children}

      <div className="flex flex-wrap gap-1 pt-1">
        {places
          .filter((p) => !shown(p.key))
          .map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => open(key)}
              className={cx(chip, 'border-dashed border-line text-muted hover:text-accent')}
            >
              + {label}
            </button>
          ))}
        {addons}
      </div>
    </div>
  )
}

function Row({
  label,
  onClear,
  children,
}: {
  label: string
  onClear?: () => void
  children: ReactNode
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 shrink-0 text-xs text-subtle">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
      {onClear && (
        <button
          type="button"
          onClick={onClear}
          aria-label={`usuń pole ${label}`}
          className="flex size-11 shrink-0 items-center justify-center text-subtle hover:text-red"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

function FieldInput({
  field,
  card,
  onChange,
}: {
  field: Key
  card: CardSnapshot
  onChange: (patch: Partial<EditableCardFields>) => void
}) {
  switch (field) {
    case 'date':
      return (
        <input
          type="date"
          className={inputClass}
          value={card.date ?? ''}
          onChange={(e) => onChange({ date: e.target.value || undefined })}
        />
      )
    case 'endDate':
      return (
        <input
          type="date"
          className={inputClass}
          min={card.date}
          value={card.endDate ?? ''}
          onChange={(e) => onChange({ endDate: e.target.value || undefined })}
        />
      )
    case 'time':
      return (
        <input
          type="time"
          className={inputClass}
          value={card.time ?? ''}
          onChange={(e) => onChange({ time: e.target.value || undefined })}
        />
      )
    case 'durationMin':
      return (
        <select
          className={inputClass}
          value={card.durationMin ?? ''}
          onChange={(e) =>
            onChange({ durationMin: e.target.value ? Number(e.target.value) : undefined })
          }
        >
          <option value="">—</option>
          {[15, 30, 45, 60, 90, 120, 180, 240, 360, 480, 720].map((m) => (
            <option key={m} value={m}>
              {formatDuration(m)}
            </option>
          ))}
        </select>
      )
    case 'remindMin':
      return (
        <select
          className={inputClass}
          value={card.remindMin ?? ''}
          onChange={(e) =>
            onChange({ remindMin: e.target.value ? Number(e.target.value) : undefined })
          }
        >
          <option value="">—</option>
          {REMIND_OPTIONS.map((m) => (
            <option key={m} value={m}>
              {formatRemind(m)}
            </option>
          ))}
        </select>
      )
    case 'arriveEarlyMin':
      return (
        <select
          className={inputClass}
          value={card.arriveEarlyMin ?? ''}
          onChange={(e) =>
            onChange({ arriveEarlyMin: e.target.value ? Number(e.target.value) : undefined })
          }
        >
          <option value="">
            domyślnie {formatDuration(arriveEarlyMin({ ...card, arriveEarlyMin: undefined }))}
          </option>
          {EARLY_OPTIONS.map((m) => (
            <option key={m} value={m}>
              {m ? formatDuration(m) : 'na styk'}
            </option>
          ))}
        </select>
      )
    case 'location':
    case 'destination':
      return <LocationField field={field} card={card} onChange={onChange} />
  }
}

/** Krótki opis pól do kafelka na Liście: '14:30 · 2 h · do 16 lip'. */
export function fieldsSummary(card: CardSnapshot): string {
  return [
    card.time,
    card.durationMin && formatDuration(card.durationMin),
    card.endDate && `do ${formatShortDate(card.endDate)}`,
  ]
    .filter(Boolean)
    .join(' · ')
}

/** Miejsce: nazwa i adres ręcznie albo wklejony link Google Maps (współrzędne), mapka i nawigacja. */
function LocationField({
  field,
  card,
  onChange,
}: {
  field: 'location' | 'destination'
  card: CardSnapshot
  onChange: (patch: Partial<EditableCardFields>) => void
}) {
  const location = card[field]
  const [link, setLink] = useState('')
  const [state, setState] = useState<'idle' | 'resolving' | 'failed' | 'offline'>('idle')
  const [relink, setRelink] = useState(false)
  const hasCoords = location?.lat !== undefined && location?.lng !== undefined

  const set = (patch: Partial<CardLocation>) =>
    onChange({ [field]: { name: location?.name ?? '', ...location, ...patch } })

  const resolve = async (text: string) => {
    if (!text.trim()) return
    setState('resolving')
    let place: Awaited<ReturnType<typeof resolvePastedPlace>>
    try {
      place = await resolvePastedPlace(text)
    } catch {
      setState('offline')
      return
    }
    if (!place) {
      setState('failed')
      return
    }
    setLink('')
    setState('idle')
    setRelink(false)
    onChange({
      [field]: {
        // Nowy link przy zmianie miejsca: nazwa i adres z linku, nie stare.
        name: (!relink && location?.name) || place.name,
        address: (!relink && location?.address) || place.address || undefined,
        ...(place.lat != null && place.lng != null && { lat: place.lat, lng: place.lng }),
        ...(place.mapsUrl && { mapsUrl: place.mapsUrl }),
      },
    })
  }

  return (
    <div className="flex flex-col gap-1">
      <input
        className={inputClass}
        placeholder="nazwa miejsca"
        value={location?.name ?? ''}
        onChange={(e) => set({ name: e.target.value })}
      />
      <input
        className={inputClass}
        placeholder="adres (opcjonalnie)"
        value={location?.address ?? ''}
        onChange={(e) => set({ address: e.target.value || undefined })}
      />
      {(!location?.mapsUrl || relink) && (
        <input
          className={inputClass}
          inputMode="url"
          placeholder="wklej link z Map Google"
          value={link}
          onChange={(e) => {
            setLink(e.target.value)
            setState('idle')
          }}
          onPaste={(e) => void resolve(e.clipboardData.getData('text'))}
          onBlur={() => void resolve(link)}
        />
      )}
      {state === 'resolving' && <span className="text-xs text-subtle">szukam miejsca…</span>}
      {state === 'failed' && (
        <span className="text-xs text-red">● nie rozpoznano linku do Map Google</span>
      )}
      {state === 'offline' && (
        <span className="text-xs text-red">● brak zasięgu — wklej link jeszcze raz później</span>
      )}
      {hasCoords && (
        <MiniMap lat={location.lat as number} lng={location.lng as number} className="mt-1" />
      )}
      {(hasCoords || location?.mapsUrl) && (
        <div className="grid grid-cols-2 gap-1">
          {hasCoords && (
            <a
              href={navigationUrl({ lat: location.lat as number, lng: location.lng as number })}
              target="_blank"
              rel="noreferrer"
              className="flex min-h-11 items-center justify-center gap-1 rounded-small bg-accent text-sm font-bold text-on-accent"
            >
              <Navigation className="size-4" aria-hidden="true" /> nawiguj
            </a>
          )}
          <a
            href={placeUrl(location ?? {})}
            target="_blank"
            rel="noreferrer"
            className="flex min-h-11 items-center justify-center rounded-small border border-line text-sm text-muted"
          >
            Mapy Google ›
          </a>
        </div>
      )}
      {location?.mapsUrl && !relink && (
        <button
          type="button"
          onClick={() => setRelink(true)}
          className="min-h-11 self-start px-1 text-xs text-subtle hover:text-accent"
        >
          inne miejsce · wklej nowy link ›
        </button>
      )}
    </div>
  )
}

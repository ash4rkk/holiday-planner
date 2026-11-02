'use client'

import {
  CARD_STATUS_LABELS,
  CARD_STATUSES,
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

type Key = 'date' | 'endDate' | 'time' | 'durationMin' | 'status' | 'location' | 'remindMin'

const FIELDS: { key: Key; label: string }[] = [
  { key: 'date', label: 'data' },
  { key: 'endDate', label: 'data końcowa' },
  { key: 'time', label: 'godzina' },
  { key: 'durationMin', label: 'czas trwania' },
  { key: 'status', label: 'status' },
  { key: 'location', label: 'miejsce' },
  { key: 'remindMin', label: 'przypomnienie' },
]

/** Pola opcjonalne: puste są zwinięte do „+ pole”, wypełnione pokazują się jako wiersze. */
export function CardFields({
  card,
  onChange,
}: {
  card: CardSnapshot
  onChange: (patch: Partial<EditableCardFields>) => void
}) {
  const [opened, setOpened] = useState<Set<Key>>(new Set())
  const isShown = (key: Key) => card[key] !== undefined || opened.has(key)
  const open = (key: Key) => setOpened((s) => new Set(s).add(key))
  const clear = (key: Key) => {
    setOpened((s) => {
      const next = new Set(s)
      next.delete(key)
      return next
    })
    onChange({ [key]: undefined })
  }

  const shown = FIELDS.filter((f) => isShown(f.key))
  const hidden = FIELDS.filter((f) => !isShown(f.key))

  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      {shown.map(({ key, label }) => (
        <Row key={key} label={label} onClear={() => clear(key)}>
          <FieldInput field={key} card={card} onChange={onChange} />
        </Row>
      ))}
      {hidden.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {hidden.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => open(key)}
              className="min-h-9 rounded-small border border-line px-3 text-xs text-muted transition-colors hover:text-accent"
            >
              + {label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Row({
  label,
  onClear,
  children,
}: {
  label: string
  onClear: () => void
  children: ReactNode
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 shrink-0 text-xs text-subtle italic">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
      <button
        type="button"
        onClick={onClear}
        aria-label={`usuń pole ${label}`}
        className="flex size-11 shrink-0 items-center justify-center text-dim hover:text-red"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
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
    case 'status':
      return (
        <div className="flex gap-1">
          {CARD_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={card.status === s}
              onClick={() => onChange({ status: s })}
              className={cx(
                'min-h-11 flex-1 rounded-small border px-1 text-xs transition-colors',
                card.status === s
                  ? 'border-accent bg-accent/20 text-accent'
                  : 'border-line text-muted',
              )}
            >
              {CARD_STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      )
    case 'location':
      return <LocationField card={card} onChange={onChange} />
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
  card,
  onChange,
}: {
  card: CardSnapshot
  onChange: (patch: Partial<EditableCardFields>) => void
}) {
  const location = card.location
  const [link, setLink] = useState('')
  const [state, setState] = useState<'idle' | 'resolving' | 'failed'>('idle')
  const hasCoords = location?.lat !== undefined && location?.lng !== undefined

  const set = (patch: Partial<CardLocation>) =>
    onChange({ location: { name: location?.name ?? '', ...location, ...patch } })

  const resolve = async (text: string) => {
    if (!text.trim()) return
    setState('resolving')
    const place = await resolvePastedPlace(text).catch(() => null)
    if (!place) {
      setState('failed')
      return
    }
    setLink('')
    setState('idle')
    onChange({
      location: {
        name: location?.name || place.name,
        address: location?.address || place.address || undefined,
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
      {!location?.mapsUrl && (
        <input
          className={inputClass}
          inputMode="url"
          placeholder="wklej link z Google Maps"
          value={link}
          onChange={(e) => {
            setLink(e.target.value)
            setState('idle')
          }}
          onPaste={(e) => void resolve(e.clipboardData.getData('text'))}
          onBlur={() => void resolve(link)}
        />
      )}
      {state === 'resolving' && <span className="text-xs text-subtle italic">szukam miejsca…</span>}
      {state === 'failed' && (
        <span className="text-xs text-red">● to nie jest link do Google Maps</span>
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
    </div>
  )
}

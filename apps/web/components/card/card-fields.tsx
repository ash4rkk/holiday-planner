'use client'

import {
  arriveEarlyMin,
  CARD_STATUS_LABELS,
  type CardLocation,
  type CardSnapshot,
  dateRange,
  type EditableCardFields,
  formatShortDate,
  navigationUrl,
  placeUrl,
} from '@planer/core'
import {
  Bell,
  CalendarCheck,
  CalendarDays,
  CalendarRange,
  Clock,
  Flag,
  Hourglass,
  Lightbulb,
  type LucideIcon,
  MapPin,
  Navigation,
  TimerReset,
  X,
} from 'lucide-react'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { MiniMap } from '@/components/map/mini-map'
import { cx, inputClass, SectionLabel } from '@/components/ui'
import { locateAddress, resolvePastedPlace } from '@/lib/place-card'
import { useTrip } from '@/lib/yjs/trip-doc'
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
  WHEN.filter(
    (f) =>
      (f.key !== 'arriveEarlyMin' || card.type === 'transport') &&
      // Kilka dni trwa nocleg albo wynajem auta; przy innych kartach tylko, gdy już ustawiona.
      (f.key !== 'endDate' ||
        card.type === 'stay' ||
        card.type === 'transport' ||
        card.endDate !== undefined),
  )

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

const WEEKDAY = ['nd', 'pn', 'wt', 'śr', 'cz', 'pt', 'sb']
const weekday = (date: string) => WEEKDAY[new Date(`${date}T00:00:00Z`).getUTCDay()] as string
const dayOfMonth = (date: string) => Number(date.slice(8, 10))

const pill = 'flex min-h-10 items-center gap-2 rounded-full border text-sm transition-colors'
const tile =
  'flex min-h-20 flex-col items-center justify-center gap-1 rounded-island border p-2 text-center transition-colors'

const WHEN_ICON: Record<TimeKey, LucideIcon> = {
  date: CalendarDays,
  endDate: CalendarRange,
  time: Clock,
  durationMin: Hourglass,
  remindMin: Bell,
  arriveEarlyMin: TimerReset,
}

/**
 * Pola karty: „kiedy” jako kafelki dni wyjazdu (plus „pomysł” i „inna data”) i pigułki godziny,
 * czasu i przypomnienia (dotknięcie otwiera pole pod spodem), potem miejsca i dalsze wysepki z
 * `children`, a na dole kafelki dodatków: miejsce, rezerwacja i `addons`.
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
  const { trip } = useTrip()
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
    { key: 'location' as const, label: 'miejsce', icon: MapPin },
    ...(card.type === 'transport'
      ? [{ key: 'destination' as const, label: 'dokąd', icon: Flag }]
      : []),
  ]
  // Wariant nie ma własnej daty (liczy się karta główna), więc nie ma też wyboru dnia.
  const variant = card.variantOf !== undefined
  const days = trip.startDate && trip.endDate ? dateRange(trip.startDate, trip.endDate) : []
  const otherDate = Boolean(card.date && !days.includes(card.date))
  const pills = whenFields(card).filter((f) => f.key !== 'date' || !days.length)
  // Wybrany dzień na środku rzędu (przy długim wyjeździe byłby poza ekranem).
  const dayRow = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const row = dayRow.current
    const el = row?.querySelector<HTMLElement>('[aria-pressed="true"]')
    if (row && el) row.scrollLeft = el.offsetLeft - row.clientWidth / 2 + el.clientWidth / 2
  }, [])

  return (
    <div className="flex flex-col gap-2">
      <section className="flex flex-col gap-2" aria-label="kiedy">
        <SectionLabel>kiedy</SectionLabel>
        {!variant && days.length > 0 && (
          <div
            ref={dayRow}
            className="relative -mx-1 flex gap-1 overflow-x-auto px-1"
            role="group"
            aria-label="dzień"
          >
            <DayTile
              active={!card.date}
              onClick={() => {
                setEditing(null)
                onChange({ date: undefined, endDate: undefined })
              }}
            >
              <Lightbulb className="size-4" aria-hidden="true" />
              <span className="text-2xs">pomysł</span>
            </DayTile>
            {days.map((d) => (
              <DayTile
                key={d}
                active={card.date === d}
                onClick={() => {
                  setEditing(null)
                  onChange({ date: d })
                }}
              >
                <span className="text-2xs">{weekday(d)}</span>
                <b className="text-base tabular-nums">{dayOfMonth(d)}</b>
              </DayTile>
            ))}
            <DayTile
              active={otherDate || editing === 'date'}
              onClick={() => setEditing(editing === 'date' ? null : 'date')}
              label="inna data"
            >
              <CalendarDays className="size-4" aria-hidden="true" />
              <span className="text-2xs">
                {otherDate ? formatShortDate(card.date as string) : 'inna'}
              </span>
            </DayTile>
          </div>
        )}
        <div className="flex flex-wrap gap-1">
          {pills
            .filter((f) => !variant || f.key !== 'date')
            .map(({ key, label, value }) => {
              const Icon = WHEN_ICON[key]
              const set = card[key] !== undefined
              return set ? (
                <span
                  key={key}
                  className={cx(
                    pill,
                    'pr-1 pl-3',
                    editing === key ? 'border-accent bg-active' : 'border-line bg-panel',
                  )}
                >
                  <button
                    type="button"
                    aria-pressed={editing === key}
                    onClick={() => setEditing(editing === key ? null : key)}
                    className="flex min-h-10 items-center gap-2"
                  >
                    <Icon className="size-4 text-muted" aria-hidden="true" />
                    <b className="tabular-nums">{value(card)}</b>
                  </button>
                  <button
                    type="button"
                    onClick={() => clear(key)}
                    aria-label={`usuń: ${label}`}
                    className="hit flex size-8 items-center justify-center rounded-full text-subtle hover:bg-raised hover:text-red"
                  >
                    <X className="size-3.5" aria-hidden="true" />
                  </button>
                </span>
              ) : (
                <button
                  key={key}
                  type="button"
                  aria-pressed={editing === key}
                  onClick={() => setEditing(editing === key ? null : key)}
                  className={cx(
                    pill,
                    'px-3',
                    editing === key
                      ? 'border-accent bg-active text-accent'
                      : 'border-dashed border-line text-muted hover:text-accent',
                  )}
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {label}
                </button>
              )
            })}
        </div>
        {active && (
          <div className="island fade-in p-2">
            <Row label={active.label} onClear={() => clear(active.key)}>
              <FieldInput field={active.key} card={card} onChange={onChange} />
            </Row>
          </div>
        )}
      </section>

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

      <div className="grid grid-cols-4 gap-1">
        {places
          .filter((p) => !shown(p.key))
          .map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => open(key)}
              className={cx(tile, 'border-dashed border-line text-muted hover:text-accent')}
            >
              <Icon className="size-5" aria-hidden="true" />
              <span className="text-2xs">{label}</span>
            </button>
          ))}
        <StatusTile card={card} onChange={onChange} />
        {addons}
      </div>
    </div>
  )
}

function DayTile({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean
  onClick: () => void
  label?: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={label}
      onClick={onClick}
      className={cx(
        'flex min-h-14 min-w-14 shrink-0 flex-col items-center justify-center rounded-island border px-2 leading-tight transition-colors',
        active ? 'border-accent bg-active text-accent' : 'border-line bg-panel text-muted',
      )}
    >
      {children}
    </button>
  )
}

/** Rezerwacja jednym kafelkiem: brak → „do rezerwacji” (bursztyn) → „zarezerwowane” (zieleń) → brak. */
function StatusTile({
  card,
  onChange,
}: {
  card: CardSnapshot
  onChange: (patch: Partial<EditableCardFields>) => void
}) {
  const next =
    card.status === undefined ? 'missing' : card.status === 'missing' ? 'booked' : undefined
  const tone =
    card.status === 'missing' ? 'text-amber' : card.status === 'booked' ? 'text-green' : ''
  return (
    <button
      type="button"
      onClick={() => onChange({ status: next })}
      aria-label={`rezerwacja: ${card.status ? CARD_STATUS_LABELS[card.status] : 'brak'}, zmień`}
      className={cx(
        tile,
        card.status
          ? 'border-line bg-panel'
          : 'border-dashed border-line text-muted hover:text-accent',
      )}
    >
      <CalendarCheck className={cx('size-5', tone)} aria-hidden="true" />
      <span className={cx('text-2xs', card.status && cx('font-bold', tone))}>
        {card.status ? CARD_STATUS_LABELS[card.status] : 'rezerwacja'}
      </span>
    </button>
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
  const [state, setState] = useState<'idle' | 'resolving' | 'failed' | 'offline' | 'notFound'>(
    'idle',
  )
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

  // Adres bez linku z Map Google: współrzędne z geokodera, żeby miejsce było na Mapie.
  const canLocate = !!location?.address?.trim() && !location.mapsUrl && !hasCoords
  const locate = async () => {
    if (!canLocate || !location?.address) return
    setState('resolving')
    let at: Awaited<ReturnType<typeof locateAddress>>
    try {
      at = await locateAddress(location.name, location.address)
    } catch {
      setState('offline')
      return
    }
    setState(at ? 'idle' : 'notFound')
    if (at) onChange({ [field]: { ...location, ...at } })
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
        onChange={(e) => {
          // Współrzędne z geokodera należą do starego adresu; z linku zostają.
          const { lat, lng, ...rest } = location ?? { name: '' }
          const keep = location?.mapsUrl && lat !== undefined ? { lat, lng } : {}
          onChange({ [field]: { ...rest, ...keep, address: e.target.value || undefined } })
          setState('idle')
        }}
        onBlur={() => void locate()}
      />
      {canLocate && state === 'idle' && (
        <button
          type="button"
          onClick={() => void locate()}
          className="min-h-11 self-start px-1 text-xs text-subtle hover:text-accent"
        >
          znajdź adres na mapie ›
        </button>
      )}
      {state === 'notFound' && (
        <span className="text-xs text-red">
          ● nie znaleziono adresu — popraw go albo wklej link z Map Google
        </span>
      )}
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

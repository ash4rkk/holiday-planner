'use client'

import {
  addDays,
  type CardSnapshot,
  dateRange,
  daysBetween,
  demoDaily,
  demoHourly,
  formatDateSpan,
  type LatLng,
  todayLocal,
  weatherPlace,
} from '@planer/core'
import { Umbrella } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { HourlyWeather } from '@/app/api/weather/hourly/route'
import type { NormalWeather } from '@/app/api/weather/normal/route'
import type { Weather } from '@/app/api/weather/route'
import { ChatButton } from '@/components/ai/chat-panel'
import { CardSheet } from '@/components/card/card-sheet'
import { SearchButton } from '@/components/search/search-button'
import { TopBar, TRIPS_BACK } from '@/components/top-bar'
import { TripMenu, TripTitle } from '@/components/trip-menu'
import { SessionBanner, TripStatus } from '@/components/trip-status'
import { cx } from '@/components/ui'
import { weatherIcon } from '@/components/weather'
import { useCardSheet } from '@/lib/use-card-sheet'
import { useCards, useTrip } from '@/lib/yjs/trip-doc'

/** Dni szczegółowe: dziś i 6 kolejnych (prognoza godzinowa). Dalej — orientacyjnie. */
const DETAIL_DAYS = 7
/** Dzienna prognoza Open-Meteo sięga 16 dni; dalej średnie z poprzednich lat. */
const FORECAST_DAYS = 16
/** Godzina z taką szansą opadu liczy się jako deszczowa. */
const RAINY = 50

const WEEKDAYS = ['nd', 'pn', 'wt', 'śr', 'cz', 'pt', 'sb']
const dayLabel = (date: string) =>
  `${WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()]} ${Number(date.slice(8))}`

/** „−3°” z prawdziwym minusem — „~-3°” czyta się jak dwa znaki tyldy. */
const deg = (t: number) => `${Math.round(t)}°`.replace('-', '−')

const placeKey = (p: LatLng) => `${p.lat.toFixed(2)},${p.lng.toFixed(2)}`

/** Kilka GET-ów naraz z tą samą pamięcią w localStorage co `useFetchCached`. */
function useFetchMany<T>(urls: string[], maxAgeMs: number): Record<string, T> {
  const [data, setData] = useState<Record<string, T>>({})
  const key = urls.join('|')
  useEffect(() => {
    let cancelled = false
    for (const url of key ? key.split('|') : []) {
      const storeKey = `planer-cache:${url}`
      let stale = true
      try {
        const raw = localStorage.getItem(storeKey)
        if (raw) {
          const { at, value } = JSON.parse(raw) as { at: number; value: T }
          setData((d) => ({ ...d, [url]: value }))
          stale = Date.now() - at > maxAgeMs
        }
      } catch {}
      if (!stale || !navigator.onLine) continue
      void fetch(url)
        .then((r) => (r.ok ? (r.json() as Promise<T>) : undefined))
        .then((value) => {
          if (cancelled || value === undefined) return
          setData((d) => ({ ...d, [url]: value }))
          try {
            localStorage.setItem(storeKey, JSON.stringify({ at: Date.now(), value }))
          } catch {}
        })
        .catch(() => {})
    }
    return () => {
      cancelled = true
    }
  }, [key, maxAgeMs])
  return data
}

const NO_URLS = { hourly: [], daily: [], normal: [] }

type Day = {
  date: string
  kind: 'past' | 'detail' | 'forecast' | 'normal'
  place?: LatLng
}

/** Pogoda na dni wyjazdu: 7 dni od dziś co godzinę, dalsze dni orientacyjnie. */
export function TripWeather({ fallback }: { fallback?: LatLng }) {
  const { trip } = useTrip()
  const cards = useCards()
  const sheet = useCardSheet()
  const today = todayLocal()
  const { startDate, endDate } = trip

  const days: Day[] = useMemo(() => {
    if (!startDate) return []
    return dateRange(startDate, endDate ?? startDate).map((date) => {
      const ahead = daysBetween(today, date)
      return {
        date,
        kind:
          ahead < 0
            ? 'past'
            : ahead < DETAIL_DAYS
              ? 'detail'
              : ahead < FORECAST_DAYS
                ? 'forecast'
                : 'normal',
        place: weatherPlace(cards, date) ?? fallback,
      }
    })
  }, [startDate, endDate, today, cards, fallback])

  // Zapytania: jedno na miejsce i rodzaj danych, nie na dzień.
  const urls = useMemo(() => {
    const hourly = new Set<string>()
    const daily = new Set<string>()
    const normal = new Map<string, { from: string; to: string }>()
    for (const d of days) {
      if (!d.place) continue
      const at = placeKey(d.place)
      if (d.kind === 'detail') hourly.add(`/api/weather/hourly?at=${at}`)
      else if (d.kind === 'normal') {
        const r = normal.get(at)
        normal.set(at, { from: r?.from ?? d.date, to: d.date })
      } else if (daysBetween(d.date, today) <= 7) daily.add(`/api/weather?at=${at}`)
    }
    return {
      hourly: [...hourly],
      daily: [...daily],
      normal: [...normal].map(
        ([at, r]) => `/api/weather/normal?at=${at}&from=${r.from}&to=${r.to}`,
      ),
    }
  }, [days, today])
  // Przykładowy wyjazd: pogoda na pokaz pod tymi samymi adresami, bez zapytań.
  const demo = trip.demoWeather
  const asked = demo ? NO_URLS : urls
  const fetchedHourly = useFetchMany<HourlyWeather>(asked.hourly, 60 * 60_000)
  const fetchedDaily = useFetchMany<Weather>(asked.daily, 3 * 60 * 60_000)
  const normal = useFetchMany<NormalWeather>(asked.normal, 7 * 24 * 60 * 60_000)
  const fake = useMemo(
    () =>
      demo && {
        hourly: Object.fromEntries(urls.hourly.map((u) => [u, demoHourly(demo)])),
        daily: Object.fromEntries(urls.daily.map((u) => [u, demoDaily(demo)])),
      },
    [demo, urls],
  )
  const hourly = fake ? fake.hourly : fetchedHourly
  const daily = fake ? fake.daily : fetchedDaily

  const find = <T,>(map: Record<string, T>, prefix: string, place?: LatLng) =>
    place
      ? Object.entries(map).find(([url]) => url.startsWith(`${prefix}?at=${placeKey(place)}`))?.[1]
      : undefined

  const detail = days.filter((d) => d.kind === 'detail')
  const later = days
    .filter((d) => d.kind === 'forecast' || d.kind === 'normal')
    .map((d) => {
      if (d.kind === 'forecast') {
        const f = find(daily, '/api/weather', d.place)?.daily.find((x) => x.date === d.date)
        return { ...d, max: f?.max, min: f?.min, code: f?.code as number | undefined }
      }
      const n = find(normal, '/api/weather/normal', d.place)?.days.find((x) => x.date === d.date)
      return { ...d, max: n?.max, min: n?.min, code: undefined, rainy: n?.rainy }
    })
  const past = days
    .filter((d) => d.kind === 'past')
    .map((d) => ({
      ...d,
      day: find(daily, '/api/weather', d.place)?.daily.find((x) => x.date === d.date),
    }))
    .filter((d) => d.day)

  const before = startDate && today < startDate
  const status = !startDate
    ? undefined
    : before
      ? `za ${daysBetween(today, startDate)} dni`
      : endDate && today > endDate
        ? 'wyjazd zakończony'
        : `dzień ${daysBetween(startDate, today) + 1} z ${daysBetween(startDate, endDate ?? startDate) + 1}`

  return (
    <>
      <TopBar
        title={<TripTitle />}
        back={TRIPS_BACK}
        morph={`trip-${trip.id}`}
        menu={<TripMenu />}
        actions={
          <>
            <SearchButton onOpenCard={(id) => sheet.open(id)} />
            <ChatButton onOpenCard={(id) => sheet.open(id)} />
            <TripStatus />
          </>
        }
      />
      <SessionBanner />
      {status && (
        <p className="px-3 pt-1 text-xs text-subtle">
          {status} · {formatDateSpan(startDate, endDate)}
        </p>
      )}

      {!startDate && <p className="island p-4 text-sm text-muted">● wyjazd nie ma jeszcze dat</p>}
      {startDate && !days.some((d) => d.place) && (
        <p className="island p-4 text-sm text-muted">
          ● dodaj miejsca do kart (np. nocleg), żeby pokazać pogodę
        </p>
      )}

      {detail.map((d, i) => (
        <DetailDay
          key={d.date}
          date={d.date}
          dayNo={startDate ? daysBetween(startDate, d.date) + 1 : i + 1}
          today={today}
          weather={find(hourly, '/api/weather/hourly', d.place)}
          cards={cards}
          onOpen={(id) => sheet.open(id)}
        />
      ))}

      {later.length > 0 && (
        <>
          {/* Kreska tygodnia tylko wtedy, gdy nad nią są dni szczegółowe. */}
          {detail.length > 0 && (
            <div className="mt-2 flex items-center gap-2 px-2">
              <span className="flex-1 border-t border-dashed border-line" />
              <span className="text-xs text-subtle">dalej niż tydzień · orientacyjnie</span>
              <span className="flex-1 border-t border-dashed border-line" />
            </div>
          )}
          <LaterDays
            days={later}
            detailFrom={
              later[0] &&
              `${dayLabel(later[0].date)} szczegółowo od ${dayLabel(addDays(later[0].date, -(DETAIL_DAYS - 1)))}`
            }
          />
        </>
      )}

      {past.length > 0 && (
        <>
          <p className="px-3 pt-3 text-xs text-subtle">minione dni</p>
          <p className="flex flex-wrap gap-x-3 px-3 text-xs text-subtle">
            {past.map((d) => {
              const { icon: Icon, label } = weatherIcon(d.day?.code ?? 0)
              return (
                <span key={d.date} className="flex items-center gap-1" title={label}>
                  {dayLabel(d.date)} <Icon className="size-3.5" aria-hidden="true" />
                  {Math.round(d.day?.max ?? 0)}°
                </span>
              )
            })}
          </p>
        </>
      )}

      {sheet.openId && (
        <CardSheet cardId={sheet.openId} isNew={sheet.isNew} onClose={sheet.close} />
      )}
    </>
  )
}

const minutesOf = (hhmm: string) => {
  const [h = 0, m = 0] = hhmm.split(':').map(Number)
  return h * 60 + m
}

function DetailDay({
  date,
  dayNo,
  today,
  weather,
  cards,
  onOpen,
}: {
  date: string
  dayNo: number
  today: string
  weather?: HourlyWeather
  cards: CardSnapshot[]
  onOpen: (id: string) => void
}) {
  const day = weather?.days.find((d) => d.date === date)
  const nowHour = new Date().getHours()
  // Dziś od bieżącej godziny, inne dni od 6:00.
  const hours = (weather?.hours ?? []).filter(
    (h) =>
      h.time.startsWith(date) && Number(h.time.slice(11, 13)) >= (date === today ? nowHour : 6),
  )
  const rainy = hours.filter((h) => h.rain >= RAINY)
  // Karty z godziną, w czasie których wypada deszczowa godzina.
  const wet = cards.filter((c) => {
    if (c.deletedAt || c.date !== date || !c.time || c.type === 'stay') return false
    const start = minutesOf(c.time)
    const end = start + (c.durationMin ?? 60)
    return rainy.some((h) => {
      const at = Number(h.time.slice(11, 13)) * 60
      return at + 60 > start && at < end
    })
  })
  const rainFrom = rainy[0]?.time.slice(11, 13)
  const rainTo = rainy.at(-1) && Number(rainy.at(-1)?.time.slice(11, 13)) + 1
  const icon = day && weatherIcon(day.code)

  return (
    <section
      className="island mt-1 flex flex-col gap-2 p-3"
      aria-label={`pogoda ${dayLabel(date)}`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm">
          <span className="font-bold">{date === today ? 'dziś' : dayLabel(date)}</span>
          <span className="text-subtle"> · dzień {dayNo}</span>
        </p>
        {day && icon && (
          <span className="flex items-center gap-1 text-sm" title={icon.label}>
            <icon.icon className="size-4 text-amber" aria-hidden="true" />
            {Math.round(day.max)}° <span className="text-subtle">/ {Math.round(day.min)}°</span>
          </span>
        )}
      </div>

      {hours.length > 0 ? (
        <ol className="-mx-1 flex overflow-x-auto pb-1" aria-label="godzina po godzinie">
          {hours.map((h) => {
            const { icon: Icon, label } = weatherIcon(h.code)
            const wetHour = h.rain >= RAINY
            return (
              <li
                key={h.time}
                className={cx(
                  // flex-1: wieczorem zostaje kilka godzin — wypełniają szerokość zamiast stać z lewej.
                  'flex min-w-11 flex-1 flex-col items-center gap-0.5 rounded-small py-1 text-xs',
                  wetHour && 'bg-raised',
                )}
                title={label}
              >
                <span className="text-subtle">{Number(h.time.slice(11, 13))}</span>
                <Icon
                  className={cx('size-4', wetHour ? 'text-blue' : 'text-amber')}
                  aria-hidden="true"
                />
                <span className="font-bold">{Math.round(h.temp)}°</span>
                <span className={cx('text-2xs text-blue', h.rain < 20 && 'invisible')}>
                  {h.rain}%
                </span>
              </li>
            )
          })}
        </ol>
      ) : (
        <p className="text-xs text-subtle">● ładuję prognozę…</p>
      )}

      {wet.length > 0 && rainFrom && (
        <p className="text-xs text-blue">
          ● deszcz {Number(rainFrom)}–{rainTo} ·{' '}
          {wet.slice(0, 2).map((c, i) => (
            <span key={c.id}>
              {i > 0 && ', '}
              <button
                type="button"
                onClick={() => onOpen(c.id)}
                className="hit underline-offset-2 hover:underline"
              >
                {c.title || 'bez tytułu'} o {c.time}
              </button>
            </span>
          ))}
        </p>
      )}
      {day && (
        <p className="text-xs text-subtle">
          wschód {day.sunrise} · zachód {day.sunset} · wiatr do {Math.round(day.wind)} km/h
        </p>
      )}
    </section>
  )
}

type LaterDay = Day & { max?: number; min?: number; code?: number; rainy?: number }

/** Dzień „często pada”: opad co najmniej w 1 z 3 ostatnich lat. */
const OFTEN_RAINY = 0.3

const isWet = (d: LaterDay) =>
  (d.rainy !== undefined && d.rainy >= OFTEN_RAINY) || (d.code !== undefined && d.code >= 51)

/**
 * Dni orientacyjne (N1): wykres pasmowy z podpisem maksimum, 0° i numerami dni pod punktami,
 * pod nim tabela z paskami zakresu w jednej skali. Przerywane linie wykresu mówią „to szacunek”.
 */
function LaterDays({ days, detailFrom }: { days: LaterDay[]; detailFrom?: string }) {
  const temps = days.flatMap((d) => [d.max, d.min]).filter((t): t is number => t !== undefined)
  const lo = Math.min(...temps)
  const hi = Math.max(...temps)
  const pos = (t: number) => (hi > lo ? ((t - lo) / (hi - lo)) * 100 : 50)
  const source = days.every((d) => d.kind === 'normal')
    ? 'zwykle · średnia z 3 lat'
    : days.every((d) => d.kind === 'forecast')
      ? 'prognoza dzienna'
      : 'prognoza dzienna i średnie z lat'
  const normalWet = days.some((d) => d.kind === 'normal' && isWet(d))

  return (
    <section className="island mt-1 flex flex-col gap-2 p-3" aria-label="pogoda orientacyjna">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-bold">orientacyjnie</p>
        <p className="text-xs text-subtle">{source}</p>
      </div>

      {temps.length > 2 && (
        <div>
          <BandChart days={days} lo={lo} hi={hi} />
          <div
            className="mt-0.5 grid text-center text-2xs text-subtle"
            style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
            aria-hidden="true"
          >
            {days.map((d) => (
              <span key={d.date} className={cx(isWet(d) && 'text-blue')}>
                {Number(d.date.slice(8))}
              </span>
            ))}
          </div>
        </div>
      )}

      <ul className="border-t border-line pt-1">
        {days.map((d) => {
          const icon = d.code !== undefined ? weatherIcon(d.code) : undefined
          const wet = isWet(d)
          const ok = d.max !== undefined && d.min !== undefined
          return (
            <li
              key={d.date}
              className="grid min-h-9 grid-cols-[3rem_4.5rem_1fr_1.25rem] items-center gap-2 text-sm text-muted"
              title={icon?.label}
            >
              <span>{dayLabel(d.date)}</span>
              <span className="text-right tabular-nums">
                {ok ? (
                  <>
                    <span className="text-subtle">{deg(d.min as number)}</span> /{' '}
                    {deg(d.max as number)}
                  </>
                ) : (
                  <span className="text-xs text-subtle">brak danych</span>
                )}
              </span>
              <span className="relative h-1 rounded-full bg-raised" aria-hidden="true">
                {ok && (
                  <span
                    className={cx(
                      'absolute inset-y-0 rounded-full',
                      wet ? 'bg-blue/70' : 'bg-subtle/60',
                    )}
                    style={{
                      left: `${pos(d.min as number)}%`,
                      width: `${Math.max(4, pos(d.max as number) - pos(d.min as number))}%`,
                    }}
                  />
                )}
              </span>
              <span className="flex justify-center">
                {icon ? (
                  <icon.icon
                    className={cx('size-4', wet ? 'text-blue' : 'text-muted')}
                    aria-hidden="true"
                  />
                ) : (
                  wet && <Umbrella className="size-4 text-blue" aria-label="często pada" />
                )}
              </span>
            </li>
          )
        })}
      </ul>

      <p className="text-xs text-subtle">
        {[normalWet && 'parasol: padało w co najmniej 1 z 3 lat', detailFrom]
          .filter(Boolean)
          .join(' · ')}
      </p>
    </section>
  )
}

/** Wykres pasmowy maks./min.; punkty na środkach kolumn dni (pod nimi numery dni). */
function BandChart({ days, lo, hi }: { days: LaterDay[]; lo: number; hi: number }) {
  const W = 200
  const H = 60
  const top = hi + 1
  const bottom = lo - 1
  const x = (i: number) => ((i + 0.5) / days.length) * W
  const y = (t: number) => 4 + ((top - t) / (top - bottom)) * (H - 8)
  const pts = (key: 'max' | 'min') =>
    days.flatMap((d, i) => (d[key] !== undefined ? [`${x(i)},${y(d[key] as number)}`] : []))
  const max = pts('max')
  const min = pts('min')
  const zero = bottom < 0 && top > 0 ? y(0) : undefined
  const line = 'stroke-[1.5] [stroke-dasharray:4_3]'

  return (
    <div className="relative" aria-hidden="true">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-15 w-full">
        {zero !== undefined && (
          <line
            x1="0"
            x2={W}
            y1={zero}
            y2={zero}
            className="stroke-line"
            strokeDasharray="2 3"
            vectorEffect="non-scaling-stroke"
          />
        )}
        <polygon points={[...max, ...[...min].reverse()].join(' ')} className="fill-blue/10" />
        <polyline
          points={max.join(' ')}
          fill="none"
          className={cx('stroke-muted', line)}
          vectorEffect="non-scaling-stroke"
        />
        <polyline
          points={min.join(' ')}
          fill="none"
          className={cx('stroke-blue', line)}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <span className="absolute top-0 left-0 -translate-y-1/2 text-2xs text-muted">{deg(hi)}</span>
      {zero !== undefined && (
        <span
          className="absolute right-0 -translate-y-full text-2xs text-subtle"
          style={{ top: `${(zero / H) * 100}%` }}
        >
          0°
        </span>
      )}
    </div>
  )
}

import {
  blocksToHtml,
  CARD_TYPE_LABELS,
  type CardType,
  cardMeta,
  formatDateSpan,
  hasCoords,
  totalsLine,
} from '@planer/core'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import { TYPE_STYLE } from '@/components/card/type-style'
import { PublicMap, type PublicPin } from '@/components/public/public-map'
import { cx } from '@/components/ui'
import { buildExport } from '@/lib/export/build'
import { tripForToken } from '@/lib/share-links'

// Link tylko do odczytu dla rodziny: Lista dni, Mapa i kwoty; bez załączników i bez edycji.
// Poza logowaniem (proxy.ts pomija /p/*, w Cloudflare Access reguła Bypass — docs/deploy.md).

export const metadata: Metadata = { title: 'Plan wyjazdu', robots: { index: false, follow: false } }

const TYPE_VAR: Record<CardType, string> = {
  stay: '--plum',
  sight: '--amber',
  food: '--green',
  transport: '--blue',
  note: '--teal',
}

export default async function PublicTripPage({ params }: PageProps<'/p/[token]'>) {
  await connection()
  const trip = await tripForToken((await params).token)
  if (!trip) notFound()
  const { model, rate, today } = await buildExport(trip, { files: false })
  const main = trip.currencies[0] ?? 'PLN'
  const total = totalsLine(model.cards, rate, today, main)
  const pins: PublicPin[] = model.cards.filter(hasCoords).map((c) => ({
    lat: c.location.lat,
    lng: c.location.lng,
    title: c.title || c.location.name,
    colorVar: TYPE_VAR[c.type],
    label: [c.date, c.time].filter(Boolean).join(' ') || CARD_TYPE_LABELS[c.type],
  }))

  return (
    <main className="app mx-auto flex min-h-dvh max-w-xl flex-col gap-1 px-px pt-1 pb-8">
      <header className="island border-t-2 border-t-accent p-4">
        <h1 className="text-xl font-bold">{trip.title}</h1>
        <p className="text-sm text-subtle italic">
          {formatDateSpan(trip.startDate, trip.endDate)}
          {total && ` · wydatki: ${total}`}
        </p>
        <p className="mt-1 text-2xs text-dim">podgląd planu tylko do odczytu</p>
      </header>

      <PublicMap pins={pins} />

      {model.sections.map((s) => {
        const dayTotal = totalsLine(
          s.cards.map((c) => c.card),
          rate,
          today,
          main,
        )
        return (
          <section key={s.key} className="flex flex-col gap-1">
            <h2 className="flex items-baseline gap-2 px-3 pt-3 text-sm font-bold">
              {s.heading}
              {dayTotal && <span className="ml-auto text-xs text-orange">{dayTotal}</span>}
            </h2>
            {!s.cards.length && <p className="px-3 text-xs text-dim italic">pusto</p>}
            {s.cards.map(({ card, blocks }) => {
              const Icon = TYPE_STYLE[card.type].icon
              return (
                <article key={card.id} className="island relative overflow-hidden py-3 pr-3 pl-4">
                  <span
                    className={cx('absolute inset-y-0 left-0 w-1', TYPE_STYLE[card.type].bar)}
                    aria-hidden="true"
                  />
                  <div className="flex items-start gap-2">
                    <span
                      className={cx(
                        'flex size-7 shrink-0 items-center justify-center rounded-small',
                        TYPE_STYLE[card.type].chip,
                      )}
                    >
                      <Icon className="size-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="font-bold">{card.title || 'bez tytułu'}</p>
                      <p className="text-xs text-subtle italic">{cardMeta(card).join(' · ')}</p>
                    </div>
                  </div>
                  {blocks.length > 0 && (
                    // Treść kart po konwersji z ucieczką znaków (blocksToHtml) — bez HTML od użytkownika.
                    <div
                      className="public-content mt-2 text-sm text-muted"
                      dangerouslySetInnerHTML={{ __html: blocksToHtml(blocks) }}
                    />
                  )}
                </article>
              )
            })}
          </section>
        )
      })}
    </main>
  )
}

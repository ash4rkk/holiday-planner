import type * as Y from 'yjs'
import { formatAmount, sumByCurrency } from './amounts'
import { readAttachments } from './attachments'
import { CARD_STATUS_LABELS, CARD_TYPE_LABELS, type CardSnapshot } from './cards'
import { formatDateSpan, formatDayHeader } from './dates'
import {
  cardsOf,
  contentOf,
  dayIndexOf,
  fragmentLines,
  groupCardsByDay,
  readCards,
} from './trip-doc'

// Wyjazd jako tekst dla czatu AI: dni, karty z polami i treścią, załączniki z identyfikatorami
// (model może je odczytać narzędziem). Karty z kosza pomijamy.

export type TripMetaForAi = {
  title: string
  startDate?: string | null
  endDate?: string | null
  currencies: string[]
  timezone?: string
}

/** Około 15 tys. tokenów — dalej treść kart jest skracana (najpierw do 3 linii, potem do tytułu). */
const MAX_CHARS = 60_000

function cardBlock(
  card: CardSnapshot,
  lines: string[],
  files: { id: string; name: string; mime: string }[],
  maxLines: number,
): string {
  const meta = [
    card.time && `godz. ${card.time}`,
    card.durationMin && `${card.durationMin} min`,
    card.endDate && `do ${card.endDate}`,
    card.status && CARD_STATUS_LABELS[card.status],
    card.location?.name &&
      `miejsce: ${card.location.name}${card.location.address ? ` (${card.location.address})` : ''}${
        card.location.lat !== undefined
          ? ` [${card.location.lat.toFixed(5)},${card.location.lng?.toFixed(5)}]`
          : ''
      }`,
    card.amounts?.length && `kwoty: ${sumByCurrency(card.amounts).map(formatAmount).join(' + ')}`,
    card.linkPreview?.url && `link: ${card.linkPreview.url}`,
    card.pinned && 'przypięta',
  ].filter(Boolean)
  const body = lines.slice(1, 1 + maxLines)
  const out = [
    `- [${CARD_TYPE_LABELS[card.type]}] **${card.title || 'bez tytułu'}** (card:${card.id})`,
  ]
  if (meta.length) out.push(`  ${meta.join(' · ')}`)
  for (const line of body) out.push(`  > ${line}`)
  if (lines.length - 1 > maxLines) out.push(`  > … (${lines.length - 1 - maxLines} linii więcej)`)
  for (const f of files)
    out.push(`  plik: ${f.name} (att:${f.id}, ${f.mime === 'application/pdf' ? 'PDF' : 'zdjęcie'})`)
  return out.join('\n')
}

export function tripContext(
  doc: Y.Doc,
  trip: TripMetaForAi,
  rates: Record<string, number> = {},
): string {
  const cards = readCards(doc).filter((c) => !c.deletedAt)
  const map = cardsOf(doc)
  const linesOf = new Map(
    cards.map((c) => [c.id, fragmentLines(contentOf(map.get(c.id) as Y.Map<unknown>))]),
  )
  const filesOf = new Map<string, { id: string; name: string; mime: string }[]>()
  for (const a of readAttachments(doc)) filesOf.set(a.cardId, [...(filesOf.get(a.cardId) ?? []), a])
  const groups = groupCardsByDay(cards, trip)

  const render = (maxLines: number) => {
    const block = (c: CardSnapshot) =>
      cardBlock(c, linesOf.get(c.id) ?? [], filesOf.get(c.id) ?? [], maxLines)
    const parts = [
      `# Wyjazd: ${trip.title} (${formatDateSpan(trip.startDate, trip.endDate)})`,
      [
        `waluty: PLN${trip.currencies.length ? `, ${trip.currencies.join(', ')} (główna: ${trip.currencies[0]})` : ''}`,
        trip.timezone && `strefa czasowa: ${trip.timezone}`,
        Object.keys(rates).length &&
          `kursy NBP (ostatnie): ${Object.entries(rates)
            .map(([c, r]) => `1 ${c} = ${r.toFixed(4)} zł`)
            .join(', ')}`,
      ]
        .filter(Boolean)
        .join(' · '),
    ]
    if (groups.pinned.length) parts.push('## Przypięte', ...groups.pinned.map(block))
    for (const day of groups.days) {
      const index = dayIndexOf(day.date, trip.startDate, trip.endDate)
      parts.push(
        `## ${formatDayHeader(day.date)} (${day.date})${index ? ` · dzień ${index}` : ' · poza datami wyjazdu'}`,
        ...(day.cards.length ? day.cards.map(block) : ['(nic nie zaplanowano)']),
      )
    }
    if (groups.undated.length) parts.push('## Bez daty', ...groups.undated.map(block))
    return parts.join('\n\n')
  }

  for (const maxLines of [Number.POSITIVE_INFINITY, 3, 0]) {
    const text = render(maxLines)
    if (text.length <= MAX_CHARS || maxLines === 0) return text
  }
  return render(0)
}

import type * as Y from 'yjs'
import { type Amount, formatAmount, type RateLookup, sumByCurrency, totals } from './amounts'
import { readAttachments } from './attachments'
import { arrivalLabel, CARD_STATUS_LABELS, CARD_TYPE_LABELS, type CardSnapshot } from './cards'
import { formatDateSpan, formatDayHeader, formatShortDate } from './dates'
import {
  type Block,
  blocksToHtml,
  blocksToMarkdown,
  fragmentBlocks,
  htmlEscape,
  withoutTitle,
} from './rich-text'
import { cardsOf, contentOf, dayIndexOf, groupCardsByDay, readCards } from './trip-doc'

// Wyjazd do eksportu (.md, druk/PDF, publiczny link): dzień po dniu, karty z polami, treścią i sumami.

export type ExportTrip = {
  title: string
  startDate?: string | null
  endDate?: string | null
  currencies: string[]
}
export type ExportCard = { card: CardSnapshot; blocks: Block[]; files: string[] }
export type ExportSection = { key: string; heading: string; date?: string; cards: ExportCard[] }
export type ExportModel = { trip: ExportTrip; sections: ExportSection[]; cards: CardSnapshot[] }

export function exportModel(
  doc: Y.Doc,
  trip: ExportTrip,
  opts: { files?: boolean } = {},
): ExportModel {
  const cards = readCards(doc).filter((c) => !c.deletedAt)
  const map = cardsOf(doc)
  const files = new Map<string, string[]>()
  if (opts.files !== false)
    for (const a of readAttachments(doc))
      files.set(a.cardId, [...(files.get(a.cardId) ?? []), a.name])
  const item = (card: CardSnapshot): ExportCard => ({
    card,
    blocks: withoutTitle(fragmentBlocks(contentOf(map.get(card.id) as Y.Map<unknown>)), card.title),
    files: files.get(card.id) ?? [],
  })
  const g = groupCardsByDay(cards, trip)
  const sections: ExportSection[] = []
  if (g.pinned.length)
    sections.push({ key: 'pinned', heading: 'Przypięte', cards: g.pinned.map(item) })
  for (const day of g.days) {
    const index = dayIndexOf(day.date, trip.startDate, trip.endDate)
    sections.push({
      key: day.date,
      date: day.date,
      heading: `${formatDayHeader(day.date)}${index ? ` · dzień ${index}` : ''}`,
      cards: day.cards.map(item),
    })
  }
  if (g.undated.length)
    sections.push({ key: 'undated', heading: 'Bez daty', cards: g.undated.map(item) })
  return { trip, sections, cards }
}

/** Pola karty w jednej linii: godzina, czas, do kiedy, status, miejsce, kwota. */
export function cardMeta(card: CardSnapshot): string[] {
  return [
    card.time && (arrivalLabel(card) ? `${card.time} → ${arrivalLabel(card)}` : card.time),
    !arrivalLabel(card) &&
      card.durationMin &&
      (card.durationMin >= 60
        ? `${Math.floor(card.durationMin / 60)} h${card.durationMin % 60 ? ` ${card.durationMin % 60} min` : ''}`
        : `${card.durationMin} min`),
    !card.endTime && card.endDate && `do ${formatShortDate(card.endDate)}`,
    card.status && CARD_STATUS_LABELS[card.status],
    card.location?.name &&
      `⌖ ${card.location.name}${card.location.address ? `, ${card.location.address}` : ''}`,
    card.destination?.name && `→ ${card.destination.name}`,
    card.amounts?.length && sumByCurrency(card.amounts).map(formatAmount).join(' + '),
  ].filter((x): x is string => Boolean(x))
}

export function totalsLine(
  cards: CardSnapshot[],
  rate: RateLookup,
  today: string,
  main: string,
): string | undefined {
  if (!cards.some((c) => c.amounts?.length)) return undefined
  const t = totals(cards, rate, today, main)
  return [
    formatAmount({ value: t.pln, currency: 'PLN' }),
    t.main && `≈ ${formatAmount(t.main)}`,
    ...t.unconverted.map((a: Amount) => `+ ${formatAmount(a)} (bez kursu)`),
  ]
    .filter(Boolean)
    .join(' · ')
}

// ---------- Markdown ----------

export function exportMarkdown(m: ExportModel, rate: RateLookup, today: string): string {
  const main = m.trip.currencies[0] ?? 'PLN'
  const total = totalsLine(m.cards, rate, today, main)
  const out = [
    `# ${m.trip.title}`,
    `*${formatDateSpan(m.trip.startDate, m.trip.endDate)}${total ? ` · wydatki: ${total}` : ''}*`,
  ]
  for (const s of m.sections) {
    const dayTotal = totalsLine(
      s.cards.map((c) => c.card),
      rate,
      today,
      main,
    )
    out.push(`## ${s.heading}${dayTotal ? ` · ${dayTotal}` : ''}`)
    if (!s.cards.length) out.push('*(nic nie zaplanowano)*')
    for (const { card, blocks, files } of s.cards) {
      out.push(`### ${card.title || 'bez tytułu'}`)
      out.push(`*${[CARD_TYPE_LABELS[card.type], ...cardMeta(card)].join(' · ')}*`)
      if (card.location?.mapsUrl) out.push(`[mapa](${card.location.mapsUrl})`)
      if (card.linkPreview?.url)
        out.push(`[${card.linkPreview.title ?? card.linkPreview.url}](${card.linkPreview.url})`)
      if (blocks.length) out.push(blocksToMarkdown(blocks))
      if (files.length) out.push(`Załączniki: ${files.join(', ')}`)
    }
  }
  return `${out.join('\n\n')}\n`
}

// ---------- HTML do druku i PDF ----------

const PRINT_CSS = `
@page { size: A4; margin: 14mm 14mm 16mm; }
* { box-sizing: border-box; }
body { font-family: 'Atkinson Hyperlegible', 'DejaVu Sans', system-ui, sans-serif; color: #2b2a30; font-size: 10.5pt; line-height: 1.45; margin: 0; padding: 16px; max-width: 820px; margin-inline: auto; }
header { border-bottom: 2px solid #9c5859; padding-bottom: 6px; margin-bottom: 10px; }
h1 { font-size: 20pt; margin: 0; }
.sub { color: #686778; margin: 2px 0 0; }
h2 { font-size: 12.5pt; margin: 16px 0 6px; padding: 4px 0; border-bottom: 1px solid #dcd8d1; break-after: avoid; display: flex; gap: 8px; }
h2 .total { margin-left: auto; color: #2b2a30; font-weight: 700; font-size: 10pt; font-variant-numeric: tabular-nums; }
.empty { color: #686778; margin: 2px 0 8px; }
article { border: 1px solid #dcd8d1; border-left: 4px solid var(--c); border-radius: 6px; padding: 6px 10px; margin: 6px 0; break-inside: avoid; }
article h3 { font-size: 11pt; margin: 0; }
.meta { color: #4a4954; font-size: 9pt; margin: 1px 0 3px; }
.meta .type { color: var(--c); font-weight: 700; }
.content p, .content ul, .content ol, .content blockquote, .content pre { margin: 3px 0; }
.content ul, .content ol { padding-left: 18px; }
.content ul.tasks { list-style: none; padding-left: 2px; }
.content li.done { color: #686778; text-decoration: line-through; }
.content blockquote { border-left: 2px solid #dcd8d1; padding-left: 8px; color: #4a4954; }
.content h3, .content h4, .content h5 { font-size: 10.5pt; margin: 4px 0 2px; }
.files { color: #9c5859; font-size: 9pt; }
a { color: #9c5859; }
.print { display: block; margin: 0 0 10px auto; font: inherit; padding: 8px 14px; border-radius: 8px; border: 0; background: #9c5859; color: #fbfaf7; font-weight: 700; }
@media print { .print { display: none; } body { padding: 0; } }
.t-stay { --c: #85638a; } .t-sight { --c: #2e7680; } .t-food { --c: #9c5c1c; } .t-transport { --c: #3f6b8c; } .t-note { --c: #686778; }
`

export function exportHtml(
  m: ExportModel,
  rate: RateLookup,
  today: string,
  opts: { printButton?: boolean } = {},
): string {
  const e = htmlEscape
  const main = m.trip.currencies[0] ?? 'PLN'
  const total = totalsLine(m.cards, rate, today, main)
  const sections = m.sections
    .map((s) => {
      const dayTotal = totalsLine(
        s.cards.map((c) => c.card),
        rate,
        today,
        main,
      )
      const cards = s.cards.length
        ? s.cards
            .map(
              ({ card, blocks, files }) => `<article class="t-${card.type}">
<h3>${e(card.title || 'bez tytułu')}</h3>
<p class="meta"><span class="type">${e(CARD_TYPE_LABELS[card.type])}</span>${cardMeta(card)
                .map((x) => ` · ${e(x)}`)
                .join('')}</p>
${blocks.length ? `<div class="content">${blocksToHtml(blocks)}</div>` : ''}
${files.length ? `<p class="files">Załączniki: ${e(files.join(', '))}</p>` : ''}
</article>`,
            )
            .join('\n')
        : '<p class="empty">nic nie zaplanowano</p>'
      return `<section><h2>${e(s.heading)}${dayTotal ? `<span class="total">${e(dayTotal)}</span>` : ''}</h2>\n${cards}</section>`
    })
    .join('\n')
  return `<!doctype html>
<html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${e(m.trip.title)} — plan wyjazdu</title>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet">
<style>${PRINT_CSS}</style></head>
<body>
${opts.printButton ? '<button class="print" onclick="window.print()">drukuj / zapisz PDF</button>' : ''}
<header><h1>${e(m.trip.title)}</h1><p class="sub">${e(formatDateSpan(m.trip.startDate, m.trip.endDate))}${total ? ` · wydatki: ${e(total)}` : ''}</p></header>
${sections}
</body></html>`
}

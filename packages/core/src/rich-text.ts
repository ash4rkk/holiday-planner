import * as Y from 'yjs'

// Treść karty (Y.XmlFragment z Tiptapa) jako bloki, Markdown i HTML — do eksportu i druku.
// Znaczniki tekstu y-prosemirror trzyma jako atrybuty: { bold: {}, link: { href } } (nakładające się:
// „link--hash”), węzły jako elementy XML z atrybutami (heading.level, taskItem.checked).

export type Inline = {
  text: string
  bold?: boolean
  italic?: boolean
  strike?: boolean
  code?: boolean
  href?: string
}
export type Block =
  | { kind: 'p'; inline: Inline[] }
  | { kind: 'h'; level: number; inline: Inline[] }
  | { kind: 'ul' | 'ol'; items: Block[][] }
  | { kind: 'tasks'; items: { checked: boolean; blocks: Block[] }[] }
  | { kind: 'quote'; blocks: Block[] }
  | { kind: 'code'; text: string }
  | { kind: 'hr' }

function inlineOf(el: Y.XmlElement | Y.XmlFragment): Inline[] {
  const out: Inline[] = []
  for (const child of el.toArray()) {
    if (child instanceof Y.XmlText) {
      for (const op of child.toDelta() as {
        insert: unknown
        attributes?: Record<string, unknown>
      }[]) {
        if (typeof op.insert !== 'string') continue
        const marks = Object.fromEntries(
          Object.entries(op.attributes ?? {}).map(([k, v]) => [k.split('--')[0], v]),
        )
        const href = (marks.link as { href?: unknown } | undefined)?.href
        out.push({
          text: op.insert,
          ...(marks.bold !== undefined && { bold: true }),
          ...(marks.italic !== undefined && { italic: true }),
          ...(marks.strike !== undefined && { strike: true }),
          ...(marks.code !== undefined && { code: true }),
          ...(typeof href === 'string' && /^(https?:|mailto:|tel:)/i.test(href) && { href }),
        })
      }
    } else if (child instanceof Y.XmlElement && child.nodeName === 'hardBreak')
      out.push({ text: '\n' })
  }
  return out
}

function blocksOf(node: Y.XmlFragment | Y.XmlElement): Block[] {
  const out: Block[] = []
  for (const child of node.toArray()) {
    if (!(child instanceof Y.XmlElement)) continue
    const attrs = child.getAttributes() as Record<string, unknown>
    switch (child.nodeName) {
      case 'paragraph':
        out.push({ kind: 'p', inline: inlineOf(child) })
        break
      case 'heading':
        out.push({
          kind: 'h',
          level: Math.min(6, Math.max(1, Number(attrs.level) || 2)),
          inline: inlineOf(child),
        })
        break
      case 'bulletList':
      case 'orderedList':
        out.push({
          kind: child.nodeName === 'bulletList' ? 'ul' : 'ol',
          items: child
            .toArray()
            .filter((i): i is Y.XmlElement => i instanceof Y.XmlElement)
            .map(blocksOf),
        })
        break
      case 'taskList':
        out.push({
          kind: 'tasks',
          items: child
            .toArray()
            .filter((i): i is Y.XmlElement => i instanceof Y.XmlElement)
            .map((i) => ({
              checked: String(i.getAttribute('checked') as unknown) === 'true',
              blocks: blocksOf(i),
            })),
        })
        break
      case 'blockquote':
        out.push({ kind: 'quote', blocks: blocksOf(child) })
        break
      case 'codeBlock':
        out.push({
          kind: 'code',
          text: inlineOf(child)
            .map((i) => i.text)
            .join(''),
        })
        break
      case 'horizontalRule':
        out.push({ kind: 'hr' })
        break
      default:
        // Nieznany węzeł: jego zawartość, żeby nic nie zginęło.
        out.push(...blocksOf(child))
    }
  }
  return out
}

const isEmpty = (b: Block) => b.kind === 'p' && !b.inline.some((i) => i.text.trim())

/** Bloki treści bez pustych akapitów (Tiptap trzyma pusty akapit na końcu dokumentu). */
export function fragmentBlocks(fragment: Y.XmlFragment): Block[] {
  return blocksOf(fragment).filter((b) => !isEmpty(b))
}

// ---------- Markdown ----------

const mdEscape = (s: string) => s.replace(/([\\`*_[\]#<>|])/g, '\\$1')

function inlineMd(inline: Inline[]): string {
  return inline
    .map((i) => {
      if (i.text === '\n') return '  \n'
      let t = i.code ? `\`${i.text.replace(/`/g, 'ˋ')}\`` : mdEscape(i.text)
      if (i.bold) t = `**${t}**`
      if (i.italic) t = `*${t}*`
      if (i.strike) t = `~~${t}~~`
      if (i.href) t = `[${t}](${i.href})`
      return t
    })
    .join('')
}

function blockMd(b: Block, indent = ''): string {
  switch (b.kind) {
    case 'p':
      return indent + inlineMd(b.inline)
    case 'h':
      return `${'#'.repeat(b.level)} ${inlineMd(b.inline)}`
    case 'ul':
    case 'ol':
      return b.items
        .map((item, n) => {
          const marker = b.kind === 'ul' ? '- ' : `${n + 1}. `
          const [first, ...rest] = item.map((x) => blockMd(x, `${indent}   `).trimStart())
          return [`${indent}${marker}${first ?? ''}`, ...rest.map((r) => `${indent}   ${r}`)].join(
            '\n',
          )
        })
        .join('\n')
    case 'tasks':
      return b.items
        .map((item) => {
          const [first, ...rest] = item.blocks.map((x) => blockMd(x, `${indent}   `).trimStart())
          return [
            `${indent}- [${item.checked ? 'x' : ' '}] ${first ?? ''}`,
            ...rest.map((r) => `${indent}   ${r}`),
          ].join('\n')
        })
        .join('\n')
    case 'quote':
      return b.blocks
        .map((x) =>
          blockMd(x)
            .split('\n')
            .map((l) => `> ${l}`)
            .join('\n'),
        )
        .join('\n>\n')
    case 'code':
      return `\`\`\`\n${b.text}\n\`\`\``
    case 'hr':
      return '---'
  }
}

export function blocksToMarkdown(blocks: Block[]): string {
  return blocks.map((b) => blockMd(b)).join('\n\n')
}

// ---------- HTML ----------

export const htmlEscape = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

function inlineHtml(inline: Inline[]): string {
  return inline
    .map((i) => {
      if (i.text === '\n') return '<br>'
      let t = htmlEscape(i.text)
      if (i.code) t = `<code>${t}</code>`
      if (i.bold) t = `<strong>${t}</strong>`
      if (i.italic) t = `<em>${t}</em>`
      if (i.strike) t = `<s>${t}</s>`
      if (i.href) t = `<a href="${htmlEscape(i.href)}">${t}</a>`
      return t
    })
    .join('')
}

export function blocksToHtml(blocks: Block[]): string {
  return blocks
    .map((b): string => {
      switch (b.kind) {
        case 'p':
          return `<p>${inlineHtml(b.inline)}</p>`
        case 'h':
          return `<h${Math.min(6, b.level + 2)}>${inlineHtml(b.inline)}</h${Math.min(6, b.level + 2)}>`
        case 'ul':
        case 'ol':
          return `<${b.kind}>${b.items.map((i) => `<li>${blocksToHtml(i)}</li>`).join('')}</${b.kind}>`
        case 'tasks':
          return `<ul class="tasks">${b.items
            .map(
              (i) =>
                `<li class="${i.checked ? 'done' : ''}"><span class="box">${i.checked ? '☑' : '☐'}</span> ${blocksToHtml(i.blocks)}</li>`,
            )
            .join('')}</ul>`
        case 'quote':
          return `<blockquote>${blocksToHtml(b.blocks)}</blockquote>`
        case 'code':
          return `<pre><code>${htmlEscape(b.text)}</code></pre>`
        case 'hr':
          return '<hr>'
      }
    })
    .join('')
}

/** Bloki bez pierwszego, gdy to tytuł karty (eksport pokazuje tytuł osobno). */
export function withoutTitle(blocks: Block[], title: string): Block[] {
  const first = blocks[0]
  if (!first || (first.kind !== 'p' && first.kind !== 'h')) return blocks
  return first.inline
    .map((i) => i.text)
    .join('')
    .trim() === title.trim()
    ? blocks.slice(1)
    : blocks
}

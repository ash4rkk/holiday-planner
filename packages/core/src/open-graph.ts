import type { LinkPreview } from './cards'

// Podgląd linku z HTML strony: Open Graph, potem Twitter Card, potem <title> i meta description.

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === '#') {
      const n =
        code[1]?.toLowerCase() === 'x' ? Number.parseInt(code.slice(2), 16) : Number(code.slice(1))
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m
    }
    return ENTITIES[code.toLowerCase()] ?? m
  })
}

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of tag.matchAll(/([a-z:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
    out[(m[1] as string).toLowerCase()] = decodeEntities(m[3] ?? m[4] ?? m[5] ?? '')
  }
  return out
}

const clean = (text?: string, max = 300) => {
  const t = text?.replace(/\s+/g, ' ').trim()
  if (!t) return undefined
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

export function parseOpenGraph(html: string, pageUrl: string): LinkPreview {
  const head = html.slice(0, 200_000)
  const meta: Record<string, string> = {}
  for (const m of head.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attrs(m[0])
    const key = (a.property ?? a.name)?.toLowerCase()
    if (key && a.content && !(key in meta)) meta[key] = a.content
  }
  const title = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]

  let image = meta['og:image'] ?? meta['og:image:url'] ?? meta['twitter:image']
  try {
    image = image ? new URL(image, pageUrl).href : undefined
  } catch {
    image = undefined
  }
  if (image && !/^https?:/i.test(image)) image = undefined

  return {
    url: meta['og:url'] && /^https?:/i.test(meta['og:url']) ? meta['og:url'] : pageUrl,
    title: clean(
      meta['og:title'] ?? meta['twitter:title'] ?? (title && decodeEntities(title)),
      200,
    ),
    description: clean(meta['og:description'] ?? meta['twitter:description'] ?? meta.description),
    image,
    siteName: clean(meta['og:site_name'], 80),
  }
}

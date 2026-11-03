import type { ReactNode } from 'react'

// Mały renderer odpowiedzi AI: akapity, listy, nagłówki jako pogrubienie, **pogrubienie**, `kod`,
// linki [tekst](https://…) i linki do kart [tytuł](card:ID). Bez HTML z modelu — tylko tekst.

const INLINE = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(((?:https?:\/\/|card:)[^)\s]+)\)/g

function inline(text: string, onCard: (id: string) => void, key: string): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  for (const m of text.matchAll(INLINE)) {
    const at = m.index ?? 0
    if (at > last) out.push(text.slice(last, at))
    const k = `${key}-${at}`
    if (m[1]) out.push(<strong key={k}>{m[1]}</strong>)
    else if (m[2])
      out.push(
        <code key={k} className="rounded-small bg-raised px-1">
          {m[2]}
        </code>,
      )
    else if (m[4]?.startsWith('card:')) {
      const id = m[4].slice(5)
      out.push(
        <button
          key={k}
          type="button"
          onClick={() => onCard(id)}
          className="font-bold text-accent underline decoration-dotted"
        >
          {m[3]}
        </button>,
      )
    } else
      out.push(
        <a
          key={k}
          href={m[4]}
          target="_blank"
          rel="noreferrer noopener"
          className="text-accent underline"
        >
          {m[3]}
        </a>,
      )
    last = at + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

export function AiMarkdown({ text, onCard }: { text: string; onCard: (id: string) => void }) {
  const blocks: ReactNode[] = []
  let list: { ordered: boolean; items: string[] } | null = null
  let para: string[] = []
  const flushPara = () => {
    if (para.length)
      blocks.push(
        <p key={`p${blocks.length}`}>{inline(para.join(' '), onCard, `p${blocks.length}`)}</p>,
      )
    para = []
  }
  const flushList = () => {
    if (!list) return
    const Tag = list.ordered ? 'ol' : 'ul'
    const k = `l${blocks.length}`
    blocks.push(
      <Tag key={k} className={list.ordered ? 'list-decimal pl-5' : 'list-disc pl-5'}>
        {list.items.map((item, i) => (
          <li key={i}>{inline(item, onCard, `${k}-${i}`)}</li>
        ))}
      </Tag>,
    )
    list = null
  }
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd()
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/)
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/)
    const heading = line.match(/^#{1,4}\s+(.*)$/)
    if (bullet || numbered) {
      flushPara()
      const ordered = Boolean(numbered)
      if (list && list.ordered !== ordered) flushList()
      list ??= { ordered, items: [] }
      list.items.push((bullet?.[1] ?? numbered?.[1]) as string)
    } else if (heading) {
      flushPara()
      flushList()
      blocks.push(
        <p key={`h${blocks.length}`} className="font-bold">
          {inline(heading[1] as string, onCard, `h${blocks.length}`)}
        </p>,
      )
    } else if (!line.trim()) {
      flushPara()
      flushList()
    } else {
      flushList()
      para.push(line.trim())
    }
  }
  flushPara()
  flushList()
  return <div className="flex flex-col gap-2">{blocks}</div>
}

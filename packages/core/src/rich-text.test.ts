import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { blocksToHtml, blocksToMarkdown, fragmentBlocks, withoutTitle } from './rich-text'

function el(
  name: string,
  children: (Y.XmlElement | Y.XmlText)[],
  attrs: Record<string, unknown> = {},
) {
  const e = new Y.XmlElement(name)
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v as string)
  e.insert(0, children)
  return e
}
function text(parts: [string, Record<string, unknown>?][]) {
  const t = new Y.XmlText()
  // applyDelta: każdy fragment dokładnie z podanymi znacznikami (insert dziedziczyłby poprzednie).
  t.applyDelta(parts.map(([insert, attributes]) => ({ insert, ...(attributes && { attributes }) })))
  return t
}

function sample() {
  const doc = new Y.Doc()
  const f = doc.getXmlFragment('c')
  f.insert(0, [
    el('heading', [text([['Lot LO 319']])], { level: 2 }),
    el('paragraph', [
      text([
        ['odprawa '],
        ['do 8:30', { bold: {} }],
        [' · '],
        ['szczegóły', { link: { href: 'https://lot.com/x' } }],
        [' i '],
        ['javascript', { link: { href: 'javascript:alert(1)' } }],
      ]),
    ]),
    el('bulletList', [
      el('listItem', [el('paragraph', [text([['paszport']])])]),
      el('listItem', [el('paragraph', [text([['ładowarka <USB>']])])]),
    ]),
    el('taskList', [
      el('taskItem', [el('paragraph', [text([['bilet']])])], { checked: true }),
      el('taskItem', [el('paragraph', [text([['parasol']])])], { checked: false }),
    ]),
    el('blockquote', [el('paragraph', [text([['cytat']])])]),
    el('paragraph', []),
  ])
  return f
}

describe('rich text', () => {
  it('Markdown', () => {
    expect(blocksToMarkdown(fragmentBlocks(sample()))).toBe(
      [
        '## Lot LO 319',
        'odprawa **do 8:30** · [szczegóły](https://lot.com/x) i javascript',
        '- paszport\n- ładowarka \\<USB\\>',
        '- [x] bilet\n- [ ] parasol',
        '> cytat',
      ].join('\n\n'),
    )
  })

  it('HTML z ucieczką znaków; bez niebezpiecznych linków', () => {
    const html = blocksToHtml(fragmentBlocks(sample()))
    expect(html).toContain('<h4>Lot LO 319</h4>')
    expect(html).toContain('<strong>do 8:30</strong>')
    expect(html).toContain('<a href="https://lot.com/x">szczegóły</a>')
    expect(html).toContain('ładowarka &lt;USB&gt;')
    expect(html).not.toContain('javascript:')
    expect(html).toContain('<li class="done"><span class="box">☑</span> <p>bilet</p></li>')
  })

  it('tytuł pomijany, gdy jest pierwszym blokiem', () => {
    const blocks = fragmentBlocks(sample())
    expect(withoutTitle(blocks, 'Lot LO 319')).toHaveLength(blocks.length - 1)
    expect(withoutTitle(blocks, 'Inny')).toHaveLength(blocks.length)
  })
})

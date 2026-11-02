import { describe, expect, it } from 'vitest'
import { decodeEntities, parseOpenGraph } from './open-graph'

describe('parseOpenGraph', () => {
  it('Open Graph z dowolną kolejnością atrybutów i encjami', () => {
    const html = `<html><head>
      <title>Zapasowy</title>
      <meta content="Muzea Watykańskie &amp; Kaplica" property="og:title">
      <meta property='og:description' content="Bilety &#8211; godziny otwarcia">
      <meta property="og:image" content="/img/cover.jpg" />
      <meta property="og:site_name" content="Musei Vaticani">
    </head></html>`
    expect(parseOpenGraph(html, 'https://www.museivaticani.va/bilety')).toEqual({
      url: 'https://www.museivaticani.va/bilety',
      title: 'Muzea Watykańskie & Kaplica',
      description: 'Bilety – godziny otwarcia',
      image: 'https://www.museivaticani.va/img/cover.jpg',
      siteName: 'Musei Vaticani',
    })
  })

  it('zapas: <title> i meta description; obraz tylko http(s)', () => {
    const html =
      '<title>\n  Trattoria  </title><meta name="description" content="Kuchnia rzymska"><meta property="og:image" content="javascript:alert(1)">'
    expect(parseOpenGraph(html, 'https://a.pl/')).toEqual({
      url: 'https://a.pl/',
      title: 'Trattoria',
      description: 'Kuchnia rzymska',
      image: undefined,
      siteName: undefined,
    })
  })

  it('encje', () => {
    expect(decodeEntities('a &lt;b&gt; &#x41; &unknown;')).toBe('a <b> A &unknown;')
  })
})

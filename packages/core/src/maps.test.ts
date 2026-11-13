import { describe, expect, it } from 'vitest'
import {
  coordsFromMapsUrl,
  decodePolyline,
  fanOffsets,
  geocodeQueries,
  googlePlaceDetails,
  googlePlaceId,
  isAllowedMapsHost,
  isGoogleMapsUrl,
  mainCluster,
  nameFromMapsUrl,
  navigationUrl,
  offMapReason,
  parseShared,
  unwrapConsentUrl,
} from './maps'

describe('isGoogleMapsUrl', () => {
  it.each([
    ['https://maps.app.goo.gl/AbCdEf123', true],
    ['https://goo.gl/maps/xyz', true],
    ['https://goo.gl/other', false],
    ['https://www.google.com/maps/place/Koloseum/@41.89,12.49,17z', true],
    ['https://www.google.pl/maps/@41.9,12.5,15z', true],
    ['https://maps.google.it/?q=41.9,12.5', true],
    ['https://www.google.com/search?q=koloseum', false],
    ['https://evil.com/maps/place/x', false],
    ['https://google.com.evil.com/maps', false],
    ['https://google.ab.io/maps/place/x', false],
    ['https://maps.google.xy.io/maps', false],
    ['javascript:alert(1)', false],
  ])('%s → %s', (url, ok) => expect(isGoogleMapsUrl(url)).toBe(ok))

  it('hosty przekierowań', () => {
    expect(isAllowedMapsHost('https://consent.google.com/m?continue=x')).toBe(true)
    expect(isAllowedMapsHost('https://www.google.co.uk/maps')).toBe(true)
    expect(isAllowedMapsHost('https://www.google.com.br/maps')).toBe(true)
    expect(isAllowedMapsHost('http://169.254.169.254/latest')).toBe(false)
    expect(isAllowedMapsHost('https://google.ab.io/x')).toBe(false)
    expect(isAllowedMapsHost('https://maps.google.xy.io/x')).toBe(false)
    expect(isAllowedMapsHost('http://www.google.com/maps')).toBe(false)
    expect(isAllowedMapsHost('https://www.google.com:8443/maps')).toBe(false)
  })
})

describe('parseShared', () => {
  it('nazwa, adres i krótki link z Google Maps', () => {
    expect(
      parseShared({
        text: 'Koloseum\nPiazza del Colosseo, 1, 00184 Roma RM, Włochy\nhttps://maps.app.goo.gl/rTq8sKXwq',
      }),
    ).toEqual({
      name: 'Koloseum',
      address: 'Piazza del Colosseo, 1, 00184 Roma RM, Włochy',
      mapsUrl: 'https://maps.app.goo.gl/rTq8sKXwq',
      otherUrl: undefined,
    })
  })

  it('link w polu url, nazwa w title', () => {
    expect(
      parseShared({ title: 'Pizzeria da Michele', url: 'https://maps.app.goo.gl/x1' }),
    ).toMatchObject({
      name: 'Pizzeria da Michele',
      mapsUrl: 'https://maps.app.goo.gl/x1',
    })
  })

  it('sam link', () => {
    expect(parseShared({ text: 'https://maps.app.goo.gl/x1' })).toMatchObject({
      name: undefined,
      mapsUrl: 'https://maps.app.goo.gl/x1',
    })
  })

  it('inny link', () => {
    expect(parseShared({ text: 'zobacz https://example.com/a.' }).otherUrl).toBe(
      'https://example.com/a',
    )
  })
})

describe('coordsFromMapsUrl', () => {
  it('pinezka miejsca ma pierwszeństwo przed środkiem widoku', () => {
    expect(
      coordsFromMapsUrl(
        'https://www.google.com/maps/place/Colosseo/@41.8902102,12.4896181,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d41.8902102!4d12.4922309!16s',
      ),
    ).toEqual({ lat: 41.8902102, lng: 12.4922309 })
  })

  it.each([
    ['https://maps.google.com/?q=40.8517,14.2681', { lat: 40.8517, lng: 14.2681 }],
    ['https://www.google.com/maps/search/?api=1&query=45.4642%2C9.19', { lat: 45.4642, lng: 9.19 }],
    ['https://www.google.com/maps/search/41.9,+12.5', { lat: 41.9, lng: 12.5 }],
    ['https://www.google.com/maps/@-33.8688,151.2093,12z', { lat: -33.8688, lng: 151.2093 }],
  ])('%s', (url, expected) => expect(coordsFromMapsUrl(url)).toEqual(expected))

  it('bez współrzędnych', () => {
    expect(coordsFromMapsUrl('https://www.google.com/maps/place/Koloseum')).toBeUndefined()
    expect(coordsFromMapsUrl('https://maps.google.com/?q=0,0')).toBeUndefined()
  })
})

describe('pozostałe', () => {
  it('nazwa z /place/', () => {
    expect(
      nameFromMapsUrl('https://www.google.com/maps/place/Pizzeria+da+Michele/@40.8,14.2,17z'),
    ).toBe('Pizzeria da Michele')
    expect(nameFromMapsUrl('https://www.google.com/maps/place/41.9,12.5')).toBeUndefined()
  })

  it('zgoda Google', () => {
    const target = 'https://www.google.com/maps/place/X/@1.5,2.5,17z'
    expect(
      unwrapConsentUrl(`https://consent.google.com/m?continue=${encodeURIComponent(target)}&gl=PL`),
    ).toBe(target)
  })

  it('nawigacja', () => {
    expect(navigationUrl({ lat: 41.89, lng: 12.49 })).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=41.89,12.49',
    )
  })
})

describe('trasa dnia', () => {
  it('start z noclegu, kolejność po godzinie, poza mapą', async () => {
    const Y = await import('yjs')
    const { createCard, readCards } = await import('./trip-doc')
    const { dayRoute, mapDays } = await import('./maps')
    const doc = new Y.Doc()
    const at = (lat: number) => ({ name: 'x', lat, lng: 12 })
    const hotel = createCard(doc, {
      type: 'stay',
      date: '2027-07-14',
      endDate: '2027-07-17',
      location: at(41.9),
    })
    const late = createCard(doc, {
      type: 'food',
      date: '2027-07-15',
      time: '20:00',
      location: at(41.8),
    })
    const early = createCard(doc, {
      type: 'sight',
      date: '2027-07-15',
      time: '09:00',
      location: at(41.7),
    })
    const untimed = createCard(doc, { type: 'sight', date: '2027-07-15', location: at(41.6) })
    createCard(doc, { type: 'note', date: '2027-07-15' })

    const route = dayRoute(readCards(doc), '2027-07-15')
    expect(route.start?.id).toBe(hotel)
    expect(route.stops.map((c) => c.id)).toEqual([early, late, untimed])
    expect(route.offMap).toHaveLength(1)
    // Pierwszy dzień (przylot): bez startu w hotelu — hotel to zwykły przystanek dnia.
    const first = dayRoute(readCards(doc), '2027-07-14')
    expect(first.start).toBeUndefined()
    expect(first.stops.map((c) => c.id)).toEqual([hotel])
    expect(first.end).toBeUndefined()
    // W środku pobytu dzień kończy się w tym samym hotelu — bez osobnego końca.
    expect(route.end).toBeUndefined()
    // Po wymeldowaniu (17) start z noclegu z nocy 16→17.
    expect(dayRoute(readCards(doc), '2027-07-17').start?.id).toBe(hotel)
    expect(dayRoute(readCards(doc), '2027-07-18').start).toBeUndefined()

    expect(mapDays(readCards(doc), { startDate: '2027-07-14', endDate: '2027-07-16' })).toEqual([
      { date: '2027-07-14', hasPlaces: true },
      { date: '2027-07-15', hasPlaces: true },
      { date: '2027-07-16', hasPlaces: false },
    ])

    // Zmiana hotelu 17: start w starym, koniec w nowym (gdy nowy nie jest przystankiem bez godziny).
    const next = createCard(doc, {
      type: 'stay',
      date: '2027-07-17',
      endDate: '2027-07-19',
      location: at(42.1),
    })
    const move = dayRoute(readCards(doc), '2027-07-17')
    expect(move.start?.id).toBe(hotel)
    expect(move.stops.map((c) => c.id)).toEqual([next])
    expect(move.end).toBeUndefined()
  })
})

describe('decodePolyline', () => {
  it('dekoduje przykład z dokumentacji', () => {
    expect(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@')).toEqual([
      [-120.2, 38.5],
      [-120.95, 40.7],
      [-126.453, 43.252],
    ])
  })
})

describe('mainCluster', () => {
  it('kadr na miasto, a nie na lotnisko w innym kraju', () => {
    const lisbon = [
      { lat: 38.71, lng: -9.14 },
      { lat: 38.69, lng: -9.21 },
      { lat: 38.8, lng: -9.39 },
    ]
    const warsaw = { lat: 52.17, lng: 20.97 }
    expect(mainCluster([warsaw, ...lisbon])).toEqual(lisbon)
  })

  it('łańcuch bliskich punktów to jedno skupisko', () => {
    const chain = [0, 0.3, 0.6, 0.9].map((d) => ({ lat: 50, lng: 20 + d }))
    expect(mainCluster(chain)).toHaveLength(4)
    expect(mainCluster([])).toEqual([])
  })
})

describe('geocodeQueries', () => {
  it('pomija kraj, potem kody pocztowe', () => {
    expect(geocodeQueries('1143 Budapeszt, 61 Hungária körút, Węgry')).toEqual([
      '1143 Budapeszt, 61 Hungária körút, Węgry',
      '1143 Budapeszt, 61 Hungária körút',
      'Budapeszt, 61 Hungária körút',
    ])
  })

  it('jeden człon to jedno zapytanie', () => {
    expect(geocodeQueries(' Lizbona ')).toEqual(['Lizbona'])
  })

  it('bez powtórzeń', () => {
    expect(geocodeQueries('Budapeszt, Węgry')).toEqual(['Budapeszt, Węgry', 'Budapeszt'])
  })

  it('polski kod z myślnikiem', () => {
    expect(geocodeQueries('ul. Długa 1, 80-831 Gdańsk, Polska')[2]).toBe('ul. Długa 1, Gdańsk')
  })
})

describe('offMapReason', () => {
  it('powód braku pinezki', async () => {
    const Y = await import('yjs')
    const { createCard, readCards } = await import('./trip-doc')
    const doc = new Y.Doc()
    const day = '2027-07-15'
    const ids = {
      pinned: createCard(doc, {
        type: 'sight',
        date: day,
        location: { name: 'a', lat: 1, lng: 2 },
      }),
      address: createCard(doc, {
        type: 'stay',
        date: day,
        location: { name: 'Fig Tree House', address: 'Hungária körút 61' },
      }),
      link: createCard(doc, {
        type: 'food',
        date: day,
        location: { name: 'b', mapsUrl: 'https://maps.app.goo.gl/x' },
      }),
      name: createCard(doc, { type: 'sight', location: { name: 'Fig Tree House' } }),
      none: createCard(doc, { type: 'food', date: day }),
      idea: createCard(doc, { type: 'sight' }),
      note: createCard(doc, { type: 'note', date: day }),
      transport: createCard(doc, { type: 'transport', date: day }),
    }
    const cards = readCards(doc)
    const reason = (id: string) => offMapReason(cards.find((c) => c.id === id) as never)
    expect(reason(ids.pinned)).toBeUndefined()
    expect(reason(ids.address)).toBe('address')
    expect(reason(ids.link)).toBe('link')
    expect(reason(ids.name)).toBe('name')
    expect(reason(ids.none)).toBe('none')
    expect(reason(ids.idea)).toBeUndefined()
    expect(reason(ids.note)).toBeUndefined()
    expect(reason(ids.transport)).toBeUndefined()
  })
})

describe('fanOffsets', () => {
  it.each([1, 2, 3, 5, 6, 7, 12])('%i pinezek bez nakładania, nad punktem przy łuku', (n) => {
    const out = fanOffsets(n)
    expect(out).toHaveLength(n)
    for (let i = 0; i < n; i++)
      for (let k = i + 1; k < n; k++) {
        const [a, b] = [out[i] as [number, number], out[k] as [number, number]]
        expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeGreaterThanOrEqual(36)
      }
    if (n <= 6) for (const [, y] of out) expect(y).toBeLessThan(0)
  })
})

describe('Google Places', () => {
  it('ID z Text Search', () => {
    expect(googlePlaceId({ places: [{ id: 'ChIJnZm0fyLcQUcRRl4jRKg8Ji8' }] })).toBe(
      'ChIJnZm0fyLcQUcRRl4jRKg8Ji8',
    )
    expect(googlePlaceId({ places: [] })).toBeUndefined()
    expect(googlePlaceId({ places: [{ id: '../../x' }] })).toBeUndefined()
    expect(googlePlaceId(null)).toBeUndefined()
  })

  it('szczegóły miejsca', () => {
    expect(
      googlePlaceDetails({
        id: 'ChIJnZm0fyLcQUcRRl4jRKg8Ji8',
        formattedAddress: 'Budapeszt, Szentháromság tér, 1014 Węgry',
        location: { latitude: 47.5021, longitude: 19.0348 },
      }),
    ).toEqual({
      id: 'ChIJnZm0fyLcQUcRRl4jRKg8Ji8',
      lat: 47.5021,
      lng: 19.0348,
      address: 'Budapeszt, Szentháromság tér, 1014 Węgry',
    })
    expect(googlePlaceDetails({ id: 'x', location: { latitude: 0, longitude: 0 } })).toBeUndefined()
    expect(googlePlaceDetails({ location: { latitude: 47, longitude: 19 } })).toBeUndefined()
  })
})

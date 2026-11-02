import { describe, expect, it } from 'vitest'
import {
  coordsFromMapsUrl,
  isAllowedMapsHost,
  isGoogleMapsUrl,
  nameFromMapsUrl,
  navigationUrl,
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
    ['javascript:alert(1)', false],
  ])('%s → %s', (url, ok) => expect(isGoogleMapsUrl(url)).toBe(ok))

  it('hosty przekierowań', () => {
    expect(isAllowedMapsHost('https://consent.google.com/m?continue=x')).toBe(true)
    expect(isAllowedMapsHost('http://169.254.169.254/latest')).toBe(false)
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
    // Pierwszy dzień: nocleg tej nocy, a sam nocleg nie jest przystankiem.
    expect(dayRoute(readCards(doc), '2027-07-14')).toMatchObject({
      start: { id: hotel },
      stops: [],
    })
    // Po wymeldowaniu (17) start z noclegu z nocy 16→17.
    expect(dayRoute(readCards(doc), '2027-07-17').start?.id).toBe(hotel)
    expect(dayRoute(readCards(doc), '2027-07-18').start).toBeUndefined()

    expect(mapDays(readCards(doc), { startDate: '2027-07-14', endDate: '2027-07-16' })).toEqual([
      { date: '2027-07-14', hasPlaces: true },
      { date: '2027-07-15', hasPlaces: true },
      { date: '2027-07-16', hasPlaces: false },
    ])
  })
})

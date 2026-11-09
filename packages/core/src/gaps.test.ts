import { describe, expect, it } from 'vitest'
import type { CardSnapshot } from './cards'
import {
  arrivalClock,
  arriveEarlyMin,
  cardIsPast,
  dayGaps,
  dayLegs,
  lateBy,
  legIsPast,
  legShortfall,
  nextStart,
  shiftClock,
  stayTimes,
} from './gaps'

const place = { name: 'x', lat: 1, lng: 2 }
const card = (id: string, fields: Partial<CardSnapshot>) =>
  ({ id, type: 'sight', date: '2027-07-14', ...fields }) as CardSnapshot

describe('dayGaps', () => {
  it('liczy przerwę z czasu trwania i podaje trasę, gdy obie karty mają miejsce', () => {
    const [gap] = dayGaps([
      card('a', { time: '11:30', durationMin: 120, location: place }),
      card('b', { time: '14:00', location: place }),
    ])
    expect(gap).toMatchObject({
      from: 'a',
      to: 'b',
      freeMin: 30,
      leaveAt: '13:30',
      arriveBy: '14:00',
    })
    expect(gap?.route).toBeDefined()
  })

  it('wykrywa nakładanie się', () => {
    const [gap] = dayGaps([
      card('a', { time: '10:00', durationMin: 90 }),
      card('b', { time: '11:00' }),
    ])
    expect(gap?.freeMin).toBe(-30)
    expect(gap?.route).toBeUndefined()
  })

  it('pomija noclegi i karty bez godziny, układa po czasie', () => {
    const gaps = dayGaps([
      card('b', { time: '14:00' }),
      card('stay', { type: 'stay', time: '12:00' }),
      card('note', { type: 'note' }),
      card('a', { time: '09:00' }),
    ])
    expect(gaps.map((g) => [g.from, g.to])).toEqual([['a', 'b']])
  })

  it('po transporcie z polem „dokąd” trasa rusza z celu', () => {
    const [gap] = dayGaps([
      card('a', {
        type: 'transport',
        time: '09:00',
        durationMin: 60,
        location: place,
        destination: { name: 'dworzec', lat: 1.05, lng: 2.05 },
      }),
      card('b', { time: '12:00', location: place }),
    ])
    expect(gap?.route?.from).toEqual({ lat: 1.05, lng: 2.05 })
  })

  it('po transporcie nie ma trasy, bo nie wiadomo, gdzie się kończy', () => {
    const [gap] = dayGaps([
      card('a', { type: 'transport', time: '09:00', location: place }),
      card('b', { time: '12:00', location: place }),
    ])
    expect(gap?.route).toBeUndefined()
  })

  it('bez czasu trwania liczy 0 minut', () => {
    const [gap] = dayGaps([card('a', { time: '09:00' }), card('b', { time: '09:45' })])
    expect(gap).toMatchObject({ freeMin: 45, leaveAt: '09:00' })
  })
})

describe('dayLegs', () => {
  const stay = card('h', {
    type: 'stay',
    date: '2027-07-13',
    endDate: '2027-07-16',
    location: { name: 'hotel', lat: 1.1, lng: 2.1 },
  })

  it('dodaje dojazd z noclegu i powrót', () => {
    const legs = dayLegs(
      [
        stay,
        card('a', { time: '10:00', durationMin: 60, location: place }),
        card('b', { time: '14:00', location: place }),
      ],
      '2027-07-14',
    )
    expect(legs.map((l) => l.kind)).toEqual(['start', 'between', 'end'])
    expect(legs[0]).toMatchObject({ to: 'a', arriveBy: '10:00' })
    expect(legs[0]?.route?.from).toEqual({ lat: 1.1, lng: 2.1 })
    expect(legs[2]).toMatchObject({ from: 'b', leaveAt: '14:00' })
  })

  it('tryb dojazdu z karty docelowej, przy powrocie z noclegu', () => {
    const legs = dayLegs(
      [
        { ...stay, arriveMode: 'drive' },
        card('a', { time: '10:00', location: place, arriveMode: 'walk' }),
        card('b', { time: '14:00', location: place }),
      ],
      '2027-07-14',
    )
    expect(legs.map((l) => [l.kind, l.mode, l.modeCardId])).toEqual([
      ['start', 'walk', 'a'],
      ['between', undefined, 'b'],
      ['end', 'drive', 'h'],
    ])
  })

  it('powrót z lotniska do hotelu w innym kraju: za daleko, bez trasy', () => {
    const legs = dayLegs(
      [
        { ...stay, location: { name: 'hotel', lat: 38.71, lng: -9.13 } },
        card('a', { time: '18:00', location: { name: 'Okęcie', lat: 52.17, lng: 20.97 } }),
      ],
      '2027-07-14',
    )
    const end = legs.find((l) => l.kind === 'end')
    expect(end?.far).toBe(true)
    expect(end?.route).toBeUndefined()
  })

  it('bez noclegu tylko odcinki między kartami', () => {
    const legs = dayLegs([card('a', { time: '10:00' }), card('b', { time: '14:00' })], '2027-07-14')
    expect(legs.map((l) => l.kind)).toEqual(['between'])
  })
})

describe('zapas przed kartą', () => {
  it('lot 2 h, inny transport 15 min, reszta 0, a ustawione na karcie wygrywa', () => {
    expect(arriveEarlyMin(card('a', { type: 'transport', title: 'Lot LO 319' }))).toBe(120)
    expect(
      arriveEarlyMin(
        card('a', { type: 'transport', title: 'odprawa', location: { name: 'Lotnisko Chopina' } }),
      ),
    ).toBe(120)
    expect(arriveEarlyMin(card('a', { type: 'transport', title: 'pociąg do Porto' }))).toBe(15)
    // „lot” tylko jako całe słowo: „Lotus” to nie lot.
    expect(arriveEarlyMin(card('a', { type: 'transport', title: 'autobus Lotus' }))).toBe(15)
    expect(arriveEarlyMin(card('a', { title: 'muzeum' }))).toBe(0)
    expect(arriveEarlyMin(card('a', { type: 'transport', title: 'lot', arriveEarlyMin: 0 }))).toBe(
      0,
    )
  })

  it('godzina „na miejscu” i wolny czas uwzględniają zapas', () => {
    const [gap] = dayGaps([
      card('a', { time: '06:00', durationMin: 60, location: place }),
      card('b', { type: 'transport', title: 'lot do Lizbony', time: '10:00', location: place }),
    ])
    expect(gap).toMatchObject({ arriveBy: '08:00', freeMin: 60, earlyMin: 120 })
  })
})

describe('legShortfall', () => {
  const leg = {
    id: 'x',
    kind: 'between' as const,
    leaveAt: '13:30',
    arriveBy: '14:00',
    freeMin: 30,
  }

  it('z czasu dojazdu i zapasu', () => {
    expect(legShortfall(leg, { minutes: 25 }, 10)).toBe(5)
    expect(legShortfall(leg, { minutes: 10 }, 10)).toBe(-10)
  })

  it('godzina odjazdu z rozkładu wygrywa', () => {
    expect(legShortfall(leg, { minutes: 10, departAt: '13:20' }, 10)).toBe(20)
  })

  it('bez końca karty nie ma czego liczyć', () => {
    expect(legShortfall({ ...leg, leaveAt: undefined }, { minutes: 5 }, 10)).toBeUndefined()
  })
})

describe('shiftClock', () => {
  it('przesuwa i zawija przez północ', () => {
    expect(shiftClock('10:05', -15)).toBe('09:50')
    expect(shiftClock('00:05', -10)).toBe('23:55')
  })
})

describe('arrivalClock i lateBy', () => {
  it('liczy przyjazd z odjazdu albo od teraz', () => {
    expect(arrivalClock({ minutes: 18, departAt: '11:14' }, '11:08')).toBe('11:32')
    expect(arrivalClock({ minutes: 10 }, '11:08')).toBe('11:18')
  })

  it('spóźnienie i zapas, także przez północ', () => {
    expect(lateBy('11:52', '11:40')).toBe(12)
    expect(lateBy('11:32', '11:40')).toBe(-8)
    expect(lateBy('00:10', '23:50')).toBe(20)
  })
})

describe('cardIsPast', () => {
  const now = { date: '2027-07-14', time: '12:00' }

  it('miniony dzień i skończona dziś pora', () => {
    expect(cardIsPast({ date: '2027-07-13' }, now)).toBe(true)
    expect(cardIsPast({ date: '2027-07-14', time: '09:00', durationMin: 60 }, now)).toBe(true)
  })

  it('trwająca, przyszła i bez godziny zostają', () => {
    expect(cardIsPast({ date: '2027-07-14', time: '11:00', durationMin: 120 }, now)).toBe(false)
    expect(cardIsPast({ date: '2027-07-14', time: '15:00' }, now)).toBe(false)
    expect(cardIsPast({ date: '2027-07-14' }, now)).toBe(false)
    expect(cardIsPast({ date: '2027-07-15' }, now)).toBe(false)
    expect(cardIsPast({}, now)).toBe(false)
  })

  it('karta bez czasu trwania trwa do następnej, a bez następnej do końca dnia', () => {
    const open = { date: '2027-07-14', time: '09:00' }
    expect(cardIsPast(open, now, '14:00')).toBe(false)
    expect(cardIsPast(open, now, '11:00')).toBe(true)
    expect(cardIsPast(open, now)).toBe(false)
  })

  it('nocleg trwa do ostatniego dnia', () => {
    expect(cardIsPast({ date: '2027-07-10', endDate: '2027-07-14' }, now)).toBe(false)
    expect(cardIsPast({ date: '2027-07-10', endDate: '2027-07-13' }, now)).toBe(true)
  })
})

describe('karty bez czasu trwania', () => {
  const open = card('a', { time: '10:00', createdAt: '1' })
  const next = card('b', { time: '14:00', createdAt: '2' })

  it('następna karta dnia', () => {
    expect(nextStart(open, [open, next])).toBe('14:00')
    expect(nextStart(next, [open, next])).toBeUndefined()
  })

  it('można zostać do wyjścia z dojazdem i zapasem', () => {
    const cards = [open, next]
    const legs = dayGaps(cards)
    const plans = { 'a>b': { minutes: 30 } }
    expect(stayTimes(cards, legs, plans, 10).get('a')).toBe('13:20')
    expect(stayTimes(cards, legs, {}, 10).get('a')).toBe('13:50 · bez dojazdu')
  })

  it('pomija karty z czasem i brak zapasu', () => {
    const timed = card('a', { time: '10:00', durationMin: 60, createdAt: '1' })
    expect(stayTimes([timed, next], dayGaps([timed, next]), {}, 10).size).toBe(0)
    const tight = { 'a>b': { minutes: 300 } }
    expect(stayTimes([open, next], dayGaps([open, next]), tight, 10).size).toBe(0)
  })
})

describe('legIsPast', () => {
  const date = '2027-07-14'
  const at = (time: string) => ({ date, time })
  const cards = [card('b', { time: '11:00', durationMin: 60 }), card('c', { time: '11:00' })]

  it('zostaje po starcie i końcu karty, znika dopiero po marginesie', () => {
    expect(legIsPast({ to: 'b' }, date, at('11:10'), cards)).toBe(false)
    expect(legIsPast({ to: 'b' }, date, at('12:29'), cards)).toBe(false)
    expect(legIsPast({ to: 'b' }, date, at('12:30'), cards)).toBe(true)
  })

  it('karta bez czasu trwania liczy typowy postój', () => {
    expect(legIsPast({ to: 'c' }, date, at('12:29'), cards)).toBe(false)
    expect(legIsPast({ to: 'c' }, date, at('12:30'), cards)).toBe(true)
  })

  it('zmiana godziny karty przywraca dojazd', () => {
    const moved = [card('b', { time: '15:00', durationMin: 60 })]
    expect(legIsPast({ to: 'b' }, date, at('12:30'), moved)).toBe(false)
  })

  it('miniony dzień znika, jutro i powrót do noclegu zostają', () => {
    expect(legIsPast({}, '2027-07-13', at('12:00'), cards)).toBe(true)
    expect(legIsPast({ to: 'b' }, '2027-07-15', at('12:00'), cards)).toBe(false)
    expect(legIsPast({}, date, at('23:00'), cards)).toBe(false)
  })
})

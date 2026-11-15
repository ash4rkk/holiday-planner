import { describe, expect, it } from 'vitest'
import { eventsByDay } from './calendar-events'
import { parseIcs } from './ics'
import { timetreeOccurrences } from './timetree'

const WINDOW = { from: '2027-01-01', to: '2027-12-31' }

const ics = (body: string) =>
  ['BEGIN:VCALENDAR', 'VERSION:2.0', 'X-WR-CALNAME:Rodzina', body, 'END:VCALENDAR'].join('\r\n')

describe('parseIcs', () => {
  it('czyta wydarzenie całodniowe z wyłącznym DTEND', () => {
    const { events, name } = parseIcs(
      ics(
        [
          'BEGIN:VEVENT',
          'UID:a',
          'SUMMARY:Urodziny',
          'DTSTART;VALUE=DATE:20270310',
          'DTEND;VALUE=DATE:20270312',
          'END:VEVENT',
        ].join('\r\n'),
      ),
      WINDOW,
    )
    expect(name).toBe('Rodzina')
    expect(events).toEqual([
      {
        uid: 'a@2027-03-10',
        title: 'Urodziny',
        startDate: '2027-03-10',
        endDate: '2027-03-11',
        startTime: null,
        endTime: null,
        allDay: true,
        color: null,
      },
    ])
  })

  it('przelicza czas UTC na Warszawę', () => {
    const { events } = parseIcs(
      ics(
        [
          'BEGIN:VEVENT',
          'UID:b',
          'SUMMARY:Lekarz',
          'DTSTART:20270715T080000Z',
          'DTEND:20270715T090000Z',
          'END:VEVENT',
        ].join('\r\n'),
      ),
      WINDOW,
    )
    expect(events[0]).toMatchObject({
      startDate: '2027-07-15',
      startTime: '10:00',
      endTime: '11:00',
    })
  })

  it('rozwija RRULE z EXDATE i wyjątkiem', () => {
    const { events } = parseIcs(
      ics(
        [
          'BEGIN:VEVENT',
          'UID:c',
          'SUMMARY:Basen',
          'DTSTART:20270104T180000',
          'DTEND:20270104T190000',
          'RRULE:FREQ=WEEKLY;COUNT=4',
          'EXDATE:20270111T180000',
          'END:VEVENT',
          'BEGIN:VEVENT',
          'UID:c',
          'SUMMARY:Basen (później)',
          'RECURRENCE-ID:20270118T180000',
          'DTSTART:20270118T200000',
          'DTEND:20270118T210000',
          'END:VEVENT',
        ].join('\r\n'),
      ),
      WINDOW,
    )
    expect(events.map((e) => [e.startDate, e.startTime, e.title])).toEqual([
      ['2027-01-04', '18:00', 'Basen'],
      ['2027-01-18', '20:00', 'Basen (później)'],
      ['2027-01-25', '18:00', 'Basen'],
    ])
  })

  it('pomija wydarzenia spoza okna i odwołane', () => {
    const { events } = parseIcs(
      ics(
        [
          'BEGIN:VEVENT',
          'UID:d',
          'DTSTART;VALUE=DATE:20250101',
          'END:VEVENT',
          'BEGIN:VEVENT',
          'UID:e',
          'STATUS:CANCELLED',
          'DTSTART;VALUE=DATE:20270101',
          'END:VEVENT',
        ].join('\r\n'),
      ),
      WINDOW,
    )
    expect(events).toEqual([])
  })
})

describe('timetree', () => {
  it('mapuje wydarzenia na wystąpienia', () => {
    const { events } = timetreeOccurrences(
      [
        {
          uuid: 'x',
          title: 'Wyjazd służbowy',
          all_day: true,
          start_at: Date.UTC(2027, 4, 10),
          end_at: Date.UTC(2027, 4, 12),
        },
        {
          uuid: 'y',
          title: 'Joga',
          all_day: false,
          start_at: Date.UTC(2027, 0, 5, 17),
          end_at: Date.UTC(2027, 0, 5, 18),
          start_timezone: 'Europe/Warsaw',
          recurrences: ['RRULE:FREQ=MONTHLY;COUNT=7', 'EXDATE:20270205T170000Z'],
          label_id: 2,
        },
        { uuid: 'z', title: 'notatka', category: 2, start_at: Date.UTC(2027, 0, 1) },
      ],
      WINDOW,
      'Europe/Warsaw',
      { '2': '#2ecc87' },
    )
    const trip = events.find((e) => e.title === 'Wyjazd służbowy')
    expect(trip?.color).toBeNull()
    expect(trip).toMatchObject({ startDate: '2027-05-10', endDate: '2027-05-12', allDay: true })
    const yoga = events.filter((e) => e.title === 'Joga')
    // 7 miesięcy bez lutego; w lipcu nadal 18:00 mimo czasu letniego
    expect(yoga).toHaveLength(6)
    expect(yoga.map((e) => e.startTime)).toEqual(Array(6).fill('18:00'))
    expect(yoga.every((e) => e.color === '#2ecc87')).toBe(true)
    expect(events.some((e) => e.title === 'notatka')).toBe(false)
  })

  it('rozkłada wydarzenia na dni', () => {
    const days = eventsByDay(
      [
        {
          uid: 'a',
          title: 'x',
          startDate: '2027-01-30',
          endDate: '2027-02-02',
          startTime: null,
          endTime: null,
          allDay: true,
          color: null,
        },
      ],
      '2027-02-01',
      '2027-02-28',
    )
    expect([...days.keys()]).toEqual(['2027-02-01', '2027-02-02'])
  })
})

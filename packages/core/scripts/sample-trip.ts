// Przykładowy wyjazd do ręcznych testów: 5 dni w Lizbonie, karty z miejscami, kwotami i listami.
// Daty liczone od dziś (domyślnie dziś = 3. dzień), więc zawsze widać „dziś”, miniony dzień i plan
// na kolejne. Każde uruchomienie usuwa poprzedni przykład i tworzy go od nowa pod nowym id —
// stary dokument Yjs z IndexedDB telefonu nie zleje się wtedy z nowym.
// Uruchomienie: pnpm db:sample [--day N]   (N = który dzień wyjazdu to dziś, 1–5)
import { parseArgs } from 'node:util'
import * as Y from 'yjs'
import { arrangeByDays } from '../src/board'
import type { CardLocation, CardStatus, CardType } from '../src/cards'
import { addDays } from '../src/dates'
import { eq, getDb, tripDocs, trips } from '../src/db'
import type { DemoWeatherDay } from '../src/demo-weather'

const TITLE = 'Lizbona (przykład)'
const TIMEZONE = 'Europe/Lisbon'
const DAYS = 5

import { cardsOf, contentOf, createCard, readCards } from '../src/trip-doc'

type Block = string | { ul: string[] } | { tasks: [string, boolean][] }

function text(value: string) {
  const t = new Y.XmlText()
  t.insert(0, value)
  return t
}

function block(b: Block): Y.XmlElement {
  if (typeof b === 'string') {
    const p = new Y.XmlElement('paragraph')
    p.insert(0, [text(b)])
    return p
  }
  const list = new Y.XmlElement('ul' in b ? 'bulletList' : 'taskList')
  const items = 'ul' in b ? b.ul.map((s) => [s, undefined] as const) : b.tasks
  list.insert(
    0,
    items.map(([s, checked]) => {
      const li = new Y.XmlElement(checked === undefined ? 'listItem' : 'taskItem')
      if (checked !== undefined) li.setAttribute('checked', checked as unknown as string)
      const p = new Y.XmlElement('paragraph')
      p.insert(0, [text(s)])
      li.insert(0, [p])
      return li
    }),
  )
  return list
}

const place = (name: string, lat: number, lng: number, address?: string): CardLocation => ({
  name,
  address,
  lat,
  lng,
  mapsUrl: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
})

type Sample = {
  type: CardType
  /** Dzień wyjazdu od 0. */
  day?: number
  endDay?: number
  time?: string
  durationMin?: number
  status?: CardStatus
  pinned?: boolean
  location?: CardLocation
  body: Block[]
}

const CARDS: Sample[] = [
  {
    type: 'note',
    pinned: true,
    body: [
      'Do zabrania',
      {
        tasks: [
          ['dowody i karty EKUZ', true],
          ['ładowarki i powerbank', true],
          ['wygodne buty (dużo schodów)', false],
          ['kurtka przeciwdeszczowa', false],
        ],
      },
    ],
  },
  {
    type: 'transport',
    day: 0,
    time: '10:05',
    durationMin: 255,
    status: 'booked',
    location: place('Lotnisko Humberto Delgado', 38.7742, -9.1342, 'Lizbona'),
    body: [
      'Lot WAW → LIS',
      'TP 1245, bagaż podręczny 8 kg. /+640 zł',
      'Z lotniska metrem, linia czerwona.',
    ],
  },
  {
    type: 'stay',
    day: 0,
    endDay: 4,
    time: '15:00',
    status: 'booked',
    location: place(
      'Alfama Patio Hostel',
      38.7114,
      -9.1305,
      'Escadinhas de São Estêvão 6, Lizbona',
    ),
    body: [
      'Nocleg w Alfamie',
      'Pokój dwuosobowy z łazienką, śniadania w cenie. /+520 EUR',
      'Zameldowanie od 15:00, wymeldowanie do 11:00.',
    ],
  },
  {
    type: 'food',
    day: 0,
    time: '20:00',
    status: 'booked',
    location: place('Taberna da Rua das Flores', 38.7104, -9.1427, 'Rua das Flores 103, Lizbona'),
    body: ['Kolacja w Tabernie', 'Bez rezerwacji, przyjść przed 19:30. /+48 EUR'],
  },
  {
    type: 'sight',
    day: 1,
    time: '10:00',
    durationMin: 60,
    location: place('Tramwaj 28 — Martim Moniz', 38.7155, -9.1361),
    body: ['Tramwaj 28', 'Wsiąść na pętli Martim Moniz, rano mniej ludzi. /+3,10 EUR'],
  },
  {
    type: 'sight',
    day: 1,
    time: '11:30',
    durationMin: 120,
    status: 'booked',
    location: place(
      'Castelo de São Jorge',
      38.7139,
      -9.1335,
      'Rua de Santa Cruz do Castelo, Lizbona',
    ),
    body: [
      'Zamek św. Jerzego',
      'Bilety kupione online, wejście o 11:30. /+30 EUR',
      'Widok na całe miasto z murów.',
    ],
  },
  {
    type: 'food',
    day: 1,
    time: '14:00',
    location: place('Time Out Market', 38.7069, -9.1458, 'Av. 24 de Julho 49, Lizbona'),
    body: [
      'Obiad w Time Out Market',
      { ul: ['bacalhau à brás', 'bifana', 'pastel de nata na deser'] },
      '/+35 EUR',
    ],
  },
  {
    type: 'sight',
    day: 1,
    time: '17:00',
    location: place('Miradouro da Senhora do Monte', 38.7193, -9.1328),
    body: ['Zachód słońca na Senhora do Monte', 'Najwyższy punkt widokowy, wziąć coś ciepłego.'],
  },
  {
    type: 'transport',
    day: 2,
    time: '09:30',
    location: place('Praça da Figueira', 38.7139, -9.1378),
    body: ['Tramwaj 15 do Belém', 'Karta Viva Viagem, doładować na 24 h. /+6,80 EUR'],
  },
  {
    type: 'sight',
    day: 2,
    time: '10:00',
    durationMin: 90,
    status: 'booked',
    location: place('Mosteiro dos Jerónimos', 38.6979, -9.2068, 'Praça do Império, Lizbona'),
    body: ['Klasztor Hieronimitów', 'Wejście od 10:00, bilety na dwie osoby. /+36 EUR'],
  },
  {
    type: 'food',
    day: 2,
    time: '12:00',
    location: place('Pastéis de Belém', 38.6975, -9.2032, 'R. de Belém 84, Lizbona'),
    body: ['Pastéis de Belém', 'Kolejka idzie szybko, w środku są stoliki. /+12 EUR'],
  },
  {
    type: 'sight',
    day: 2,
    time: '14:00',
    durationMin: 60,
    location: place('Torre de Belém', 38.6916, -9.216),
    body: ['Wieża Belém', '/+16 EUR'],
  },
  {
    type: 'transport',
    day: 3,
    time: '08:15',
    durationMin: 40,
    location: place('Estação do Rossio', 38.7142, -9.141),
    body: ['Pociąg do Sintry', 'Z dworca Rossio co 20 min. /+9,20 EUR'],
  },
  {
    type: 'sight',
    day: 3,
    time: '09:30',
    durationMin: 180,
    status: 'booked',
    location: place('Palácio da Pena', 38.7876, -9.3906, 'Estrada da Pena, Sintra'),
    body: ['Pałac Pena', 'Bilet z wejściem o 9:30, potem park i Zamek Maurów. /+40 EUR'],
  },
  {
    type: 'transport',
    day: 4,
    time: '18:40',
    durationMin: 265,
    status: 'booked',
    location: place('Lotnisko Humberto Delgado', 38.7742, -9.1342, 'Lizbona'),
    body: ['Lot LIS → WAW', 'Na lotnisku 2 h przed odlotem. /+690 zł'],
  },
  {
    type: 'food',
    location: place('A Ginjinha', 38.7145, -9.1384, 'Largo de São Domingos 8, Lizbona'),
    body: ['Ginjinha przy Rossio', 'Likier wiśniowy w czekoladowym kieliszku. /+3 EUR'],
  },
  {
    type: 'note',
    body: [
      'Pomysły na wolną chwilę',
      { ul: ['LX Factory w niedzielę', 'Oceanarium', 'fado w Alfamie wieczorem'] },
    ],
  },
]

const { values } = parseArgs({ options: { day: { type: 'string', default: '3' } } })
const todayIndex = Number(values.day)
if (!Number.isInteger(todayIndex) || todayIndex < 1 || todayIndex > DAYS) {
  throw new Error(`--day musi być od 1 do ${DAYS}`)
}

// Dziś w strefie wyjazdu, nie serwera.
const today = new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(new Date())
const startDate = addDays(today, 1 - todayIndex)
const endDate = addDays(startDate, DAYS - 1)

// Pogoda na pokaz (zamiast Open-Meteo): domyślnie dziś w Belém pada, jutro w Sintrze burza.
const WEATHER: Omit<DemoWeatherDay, 'date'>[] = [
  { code: 0, max: 21, min: 13 },
  { code: 2, max: 20, min: 14 },
  { code: 63, max: 17, min: 13, wet: [11, 17] },
  { code: 95, max: 16, min: 12, wet: [10, 16] },
  { code: 3, max: 18, min: 12 },
]

const db = getDb()
const removed = await db.delete(trips).where(eq(trips.title, TITLE)).returning({ id: trips.id })

const [trip] = await db
  .insert(trips)
  .values({
    title: TITLE,
    startDate,
    endDate,
    country: 'PT',
    currencies: ['EUR'],
    timezone: TIMEZONE,
    demoWeather: WEATHER.map((w, i) => ({ ...w, date: addDays(startDate, i) })),
  })
  .returning()
if (!trip) throw new Error('nie udało się utworzyć wyjazdu')

const doc = new Y.Doc()
for (const { body, day, endDay, ...fields } of CARDS) {
  const id = createCard(doc, {
    ...fields,
    date: day === undefined ? undefined : addDays(startDate, day),
    endDate: endDay === undefined ? undefined : addDays(startDate, endDay),
  })
  const content = contentOf(cardsOf(doc).get(id) as Y.Map<unknown>)
  doc.transact(() => content.push(body.map(block)))
}
arrangeByDays(doc, readCards(doc), trip)

await db
  .insert(tripDocs)
  .values({ tripId: trip.id, state: Buffer.from(Y.encodeStateAsUpdate(doc)) })
if (removed.length) console.log(`usunięto poprzedni przykład (${removed.length})`)
console.log(
  `wyjazd „${trip.title}” ${startDate} – ${endDate}, dziś = dzień ${todayIndex} (${CARDS.length} kart): /trips/${trip.id}/list`,
)
process.exit(0)

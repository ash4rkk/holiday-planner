// Przykładowy wyjazd do ręcznych testów: Lizbona 2–6 listopada 2026, karty z miejscami, kwotami i listami.
// Uruchomienie: DATABASE_URL=… pnpm --filter @planer/core exec tsx scripts/sample-trip.ts
import * as Y from 'yjs'
import { arrangeByDays } from '../src/board'
import type { CardLocation, CardStatus, CardType } from '../src/cards'
import { getDb, tripDocs, trips } from '../src/db'
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
  date?: string
  endDate?: string
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
    date: '2026-11-02',
    time: '10:05',
    durationMin: 255,
    status: 'done',
    location: place('Lotnisko Humberto Delgado', 38.7742, -9.1342, 'Lizbona'),
    body: [
      'Lot WAW → LIS',
      'TP 1245, bagaż podręczny 8 kg. /+640 zł',
      'Z lotniska metrem, linia czerwona.',
    ],
  },
  {
    type: 'stay',
    date: '2026-11-02',
    endDate: '2026-11-06',
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
    date: '2026-11-02',
    time: '20:00',
    status: 'done',
    location: place('Taberna da Rua das Flores', 38.7104, -9.1427, 'Rua das Flores 103, Lizbona'),
    body: ['Kolacja w Tabernie', 'Bez rezerwacji, przyjść przed 19:30. /+48 EUR'],
  },
  {
    type: 'sight',
    date: '2026-11-03',
    time: '10:00',
    durationMin: 60,
    status: 'idea',
    location: place('Tramwaj 28 — Martim Moniz', 38.7155, -9.1361),
    body: ['Tramwaj 28', 'Wsiąść na pętli Martim Moniz, rano mniej ludzi. /+3,10 EUR'],
  },
  {
    type: 'sight',
    date: '2026-11-03',
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
    date: '2026-11-03',
    time: '14:00',
    status: 'idea',
    location: place('Time Out Market', 38.7069, -9.1458, 'Av. 24 de Julho 49, Lizbona'),
    body: [
      'Obiad w Time Out Market',
      { ul: ['bacalhau à brás', 'bifana', 'pastel de nata na deser'] },
      '/+35 EUR',
    ],
  },
  {
    type: 'sight',
    date: '2026-11-03',
    time: '17:00',
    status: 'idea',
    location: place('Miradouro da Senhora do Monte', 38.7193, -9.1328),
    body: ['Zachód słońca na Senhora do Monte', 'Najwyższy punkt widokowy, wziąć coś ciepłego.'],
  },
  {
    type: 'transport',
    date: '2026-11-04',
    time: '09:30',
    status: 'idea',
    location: place('Praça da Figueira', 38.7139, -9.1378),
    body: ['Tramwaj 15 do Belém', 'Karta Viva Viagem, doładować na 24 h. /+6,80 EUR'],
  },
  {
    type: 'sight',
    date: '2026-11-04',
    time: '10:00',
    durationMin: 90,
    status: 'booked',
    location: place('Mosteiro dos Jerónimos', 38.6979, -9.2068, 'Praça do Império, Lizbona'),
    body: ['Klasztor Hieronimitów', 'Wejście od 10:00, bilety na dwie osoby. /+36 EUR'],
  },
  {
    type: 'food',
    date: '2026-11-04',
    time: '12:00',
    status: 'idea',
    location: place('Pastéis de Belém', 38.6975, -9.2032, 'R. de Belém 84, Lizbona'),
    body: ['Pastéis de Belém', 'Kolejka idzie szybko, w środku są stoliki. /+12 EUR'],
  },
  {
    type: 'sight',
    date: '2026-11-04',
    time: '14:00',
    durationMin: 60,
    status: 'idea',
    location: place('Torre de Belém', 38.6916, -9.216),
    body: ['Wieża Belém', '/+16 EUR'],
  },
  {
    type: 'transport',
    date: '2026-11-05',
    time: '08:15',
    durationMin: 40,
    status: 'idea',
    location: place('Estação do Rossio', 38.7142, -9.141),
    body: ['Pociąg do Sintry', 'Z dworca Rossio co 20 min. /+9,20 EUR'],
  },
  {
    type: 'sight',
    date: '2026-11-05',
    time: '09:30',
    durationMin: 180,
    status: 'booked',
    location: place('Palácio da Pena', 38.7876, -9.3906, 'Estrada da Pena, Sintra'),
    body: ['Pałac Pena', 'Bilet z wejściem o 9:30, potem park i Zamek Maurów. /+40 EUR'],
  },
  {
    type: 'transport',
    date: '2026-11-06',
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

const db = getDb()
const [trip] = await db
  .insert(trips)
  .values({
    title: 'Lizbona',
    startDate: '2026-11-02',
    endDate: '2026-11-06',
    currencies: ['EUR'],
    timezone: 'Europe/Lisbon',
  })
  .returning()
if (!trip) throw new Error('nie udało się utworzyć wyjazdu')

const doc = new Y.Doc()
for (const { body, ...fields } of CARDS) {
  const id = createCard(doc, fields)
  const content = contentOf(cardsOf(doc).get(id) as Y.Map<unknown>)
  doc.transact(() => content.push(body.map(block)))
}
arrangeByDays(doc, readCards(doc), trip)

await db
  .insert(tripDocs)
  .values({ tripId: trip.id, state: Buffer.from(Y.encodeStateAsUpdate(doc)) })
console.log(`wyjazd „${trip.title}” (${CARDS.length} kart): /trips/${trip.id}/list`)
process.exit(0)

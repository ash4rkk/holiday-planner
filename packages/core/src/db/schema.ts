import {
  bigserial,
  boolean,
  customType,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import type { CardProposal } from '../proposals'

const bytea = customType<{ data: Uint8Array; driverData: Buffer }>({
  dataType: () => 'bytea',
  toDriver: (value) => Buffer.from(value),
  fromDriver: (value) => new Uint8Array(value),
})

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  // kolor kursora na tablicy
  color: text('color').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const trips = pgTable('trips', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  startDate: date('start_date'),
  endDate: date('end_date'),
  // główna waluta wyjazdu pierwsza, np. ['EUR', 'CHF']
  currencies: text('currencies').array().notNull().default([]),
  archived: boolean('archived').notNull().default(false),
  // Kraj wyjazdu (ISO 3166-1 alfa-2, np. 'PT') — flaga przy nazwie na liście wyjazdów.
  country: text('country'),
  // Godziny kart są lokalne dla miejsca wyjazdu; strefa potrzebna do przypomnień push.
  timezone: text('timezone').notNull().default('Europe/Warsaw'),
  // Jak się poruszacie: domyślny sposób dojazdu między kartami i zapas w minutach.
  travelMode: text('travel_mode')
    .$type<'transit' | 'walk' | 'drive'>()
    .notNull()
    .default('transit'),
  travelBufferMin: integer('travel_buffer_min').notNull().default(10),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

/** Trwały stan dokumentu Yjs wyjazdu (zapisuje serwer sync). */
export const tripDocs = pgTable('trip_docs', {
  tripId: uuid('trip_id')
    .primaryKey()
    .references(() => trips.id, { onDelete: 'cascade' }),
  state: bytea('state').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

/** Skrzynka miejsc: udostępnione z Google Maps, czekają na rozdzielenie na karty. */
export const inboxItems = pgTable(
  'inbox_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tripId: uuid('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    address: text('address'),
    lat: doublePrecision('lat'),
    lng: doublePrecision('lng'),
    mapsUrl: text('maps_url'),
    note: text('note'),
    // Klucz z kolejki offline klienta: ponowne wysłanie tego samego udostępnienia nie dubluje wpisu.
    clientKey: text('client_key').unique(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    // Ustawiane, gdy z miejsca powstała karta (albo zostało odrzucone).
    usedAt: timestamp('used_at', { withTimezone: true }),
  },
  (t) => [index('inbox_items_trip_idx').on(t.tripId, t.usedAt)],
)

/** Pliki wyjazdu (bilety, rezerwacje, paragony) na dysku serwera; metadane widzi też dokument Yjs. */
export const attachments = pgTable(
  'attachments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tripId: uuid('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    filename: text('filename').notNull(),
    mime: text('mime').notNull(),
    size: integer('size').notNull(),
    // Ścieżka względem UPLOAD_DIR: <tripId>/<id>
    path: text('path').notNull(),
    sha256: text('sha256').notNull(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('attachments_trip_sha_idx').on(t.tripId, t.sha256)],
)

/** Szablony kart, np. „Lot” z polami na numer i terminal. Treść w Markdown. */
export const cardTemplates = pgTable('card_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  type: text('type').notNull(),
  markdown: text('markdown').notNull(),
  // Pola karty ustawiane przy tworzeniu, np. { "remindMin": 180, "status": "booked" }
  defaultFields: jsonb('default_fields').$type<Record<string, unknown>>().notNull().default({}),
  sortOrder: integer('sort_order').notNull().default(100),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

/** Cache kursów NBP (tabela A): ile PLN za 1 jednostkę waluty w dniu publikacji. */
export const fxRates = pgTable(
  'fx_rates',
  {
    currency: text('currency').notNull(),
    date: date('date').notNull(),
    ratePln: real('rate_pln').notNull(),
  },
  (t) => [primaryKey({ columns: [t.currency, t.date] })],
)

/** Subskrypcje Web Push (jedna na przeglądarkę/telefon). */
export const pushSubscriptions = pgTable('push_subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  endpoint: text('endpoint').notNull().unique(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  // Powiadomienia o zmianach drugiej osoby (przypomnienia z kart przychodzą zawsze).
  notifyChanges: boolean('notify_changes').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

/** Przypomnienia z kart (data + godzina − wyprzedzenie); wylicza je serwer sync przy zmianie dokumentu. */
export const reminders = pgTable(
  'reminders',
  {
    tripId: uuid('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    cardId: text('card_id').notNull(),
    fireAt: timestamp('fire_at', { withTimezone: true }).notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.tripId, t.cardId, t.fireAt] }),
    index('reminders_due_idx').on(t.sentAt, t.fireAt),
  ],
)

/**
 * Czat AI wyjazdu: jedna rozmowa na wyjazd (obie osoby widzą tę samą). `content` to bloki dokładnie
 * tak, jak idą do API (bez bloków rozumowania z zakończonych tur), `text` — to, co widać w panelu.
 */
export const aiMessages = pgTable(
  'ai_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tripId: uuid('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    role: text('role').$type<'user' | 'assistant'>().notNull(),
    content: jsonb('content').$type<unknown[]>().notNull(),
    text: text('text').notNull(),
    // Źródła z wyszukiwania w sieci (tytuł, adres) pod odpowiedzią.
    sources: jsonb('sources').$type<{ title: string; url: string }[]>().notNull().default([]),
    // Karty zaproponowane w odpowiedzi; wracają po ponownym otwarciu czatu.
    proposals: jsonb('proposals').$type<CardProposal[]>().notNull().default([]),
    // „Nowa rozmowa” — starsze wiadomości zostają w bazie, ale nie idą już do modelu.
    archived: boolean('archived').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('ai_messages_trip_idx').on(t.tripId, t.archived, t.createdAt)],
)

/** Koszt każdego wywołania AI (czat, import) — do limitu miesięcznego. */
export const aiUsage = pgTable('ai_usage', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  kind: text('kind').$type<'chat' | 'import'>().notNull(),
  model: text('model').notNull(),
  inputTokens: integer('input_tokens').notNull(),
  outputTokens: integer('output_tokens').notNull(),
  cacheReadTokens: integer('cache_read_tokens').notNull().default(0),
  cacheWriteTokens: integer('cache_write_tokens').notNull().default(0),
  webSearches: integer('web_searches').notNull().default(0),
  costPln: real('cost_pln').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

/** Zapytania do Google Routes w miesiącu (YYYY-MM) — twardy limit kosztu; czasów przejazdu tu nie ma. */
export const routesUsage = pgTable('routes_usage', {
  month: text('month').primaryKey(),
  requests: integer('requests').notNull().default(0),
})

/** Wyniki tras (czas, przesiadki, przebieg): wspólne dla obu telefonów, nie zużywają limitu drugi raz. */
export const routeCache = pgTable('route_cache', {
  key: text('key').primaryKey(),
  plan: jsonb('plan').notNull(),
  checkedAt: timestamp('checked_at', { withTimezone: true }).notNull().defaultNow(),
  // Przypomnienie „czas wyjść” idzie raz na odcinek.
  alertedAt: timestamp('alerted_at', { withTimezone: true }),
})

/** Linki tylko do odczytu dla rodziny (/p/<token>): długi losowy token, można unieważnić. */
export const shareLinks = pgTable('share_links', {
  token: text('token').primaryKey(),
  tripId: uuid('trip_id')
    .notNull()
    .references(() => trips.id, { onDelete: 'cascade' }),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
})

/** Wspólne ustawienia aplikacji (dla obu osób), np. domyślne przypomnienia: klucz → JSON. */
export const appSettings = pgTable('app_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * Dziennik zdarzeń do „logi i problemy” w ustawieniach: błędy i ostrzeżenia z workera, sync i API
 * oraz udane zadania w tle (np. nocna kopia). Worker usuwa wpisy starsze niż 30 dni.
 */
export const appEvents = pgTable(
  'app_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
    level: text('level').$type<'error' | 'warn' | 'ok'>().notNull(),
    // skąd: push, nbp, kopia, sync, pogoda, trasy…
    source: text('source').notNull(),
    message: text('message').notNull(),
  },
  (t) => [index('app_events_at_idx').on(t.at)],
)

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type Trip = typeof trips.$inferSelect
export type NewTrip = typeof trips.$inferInsert
export type InboxItem = typeof inboxItems.$inferSelect
export type Attachment = typeof attachments.$inferSelect
export type CardTemplate = typeof cardTemplates.$inferSelect
export type AiMessage = typeof aiMessages.$inferSelect
export type AppEvent = typeof appEvents.$inferSelect

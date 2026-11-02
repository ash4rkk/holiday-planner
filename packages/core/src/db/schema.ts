import {
  boolean,
  customType,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

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

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type Trip = typeof trips.$inferSelect
export type NewTrip = typeof trips.$inferInsert
export type InboxItem = typeof inboxItems.$inferSelect
export type Attachment = typeof attachments.$inferSelect
export type CardTemplate = typeof cardTemplates.$inferSelect

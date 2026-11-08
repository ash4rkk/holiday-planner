import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

export { and, asc, count, desc, eq, gte, isNull, lte, ne, or, sql } from 'drizzle-orm'
export * from './schema'

type Db = ReturnType<typeof drizzle<typeof schema>>

const globalForDb = globalThis as unknown as { planerDb?: Db }

// Jedno połączenie na proces (także przy hot reloadzie w dev).
export function getDb(): Db {
  if (!globalForDb.planerDb) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('Brak DATABASE_URL')
    globalForDb.planerDb = drizzle(postgres(url, { max: 10 }), { schema })
  }
  return globalForDb.planerDb
}

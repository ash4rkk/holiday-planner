import { Database } from '@hocuspocus/extension-database'
import { Server } from '@hocuspocus/server'
import { eq, getDb, sql, tripDocs, trips } from '@planer/core/db'
import { authenticate } from './auth'

// Serwer współedycji: jeden dokument Yjs na wyjazd (nazwa dokumentu = id wyjazdu),
// stan trwały w trip_docs. Klienci i tak trzymają kopię w IndexedDB, więc to nie jedyna kopia.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const port = Number(process.env.PORT ?? 1234)

async function tripExists(id: string): Promise<boolean> {
  if (!UUID.test(id)) return false
  const [row] = await getDb().select({ id: trips.id }).from(trips).where(eq(trips.id, id))
  return Boolean(row)
}

const server = new Server<{ email: string }>({
  port,
  quiet: true,
  // Zapis do bazy najwyżej co ~2 s przy ciągłej edycji, maksymalnie co 10 s.
  debounce: 2000,
  maxDebounce: 10_000,

  // Bez ważnego JWT nie ma nawet połączenia WebSocket.
  async onUpgrade({ request }) {
    const headers = new Headers()
    for (const [key, value] of Object.entries(request.headers)) {
      if (typeof value === 'string') headers.set(key, value)
    }
    await authenticate(headers)
  },

  async onConnect({ requestHeaders, documentName, context }) {
    context.email = await authenticate(requestHeaders)
    if (!(await tripExists(documentName))) throw new Error('nie ma takiego wyjazdu')
  },

  async onRequest({ request, response }) {
    if (request.url === '/health') {
      response.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}')
      // Hocuspocus kończy obsługę żądania, gdy hook odrzuci obietnicę.
      throw null
    }
  },

  extensions: [
    new Database({
      async fetch({ documentName }) {
        const [row] = await getDb()
          .select({ state: tripDocs.state })
          .from(tripDocs)
          .where(eq(tripDocs.tripId, documentName))
        return row?.state ?? null
      },
      async store({ documentName, state }) {
        await getDb()
          .insert(tripDocs)
          .values({ tripId: documentName, state })
          .onConflictDoUpdate({ target: tripDocs.tripId, set: { state, updatedAt: sql`now()` } })
      },
    }),
  ],
})

await server.listen()
console.log(`sync: nasłuch na porcie ${port}`)

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  // destroy() zapisuje oczekujące dokumenty przed wyjściem.
  process.on(signal, () => void server.destroy().then(() => process.exit(0)))
}

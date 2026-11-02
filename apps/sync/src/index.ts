import { createServer } from 'node:http'

// Etap 3: Hocuspocus (WebSocket) z zapisem dokumentów Yjs do trip_docs.
const port = Number(process.env.PORT ?? 1234)

createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}')
    return
  }
  res.writeHead(404).end()
}).listen(port, () => console.log(`sync: zaślepka na porcie ${port}`))

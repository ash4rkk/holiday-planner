// Biblioteki z własnymi workerami (MapLibre, PDF.js) szukają ich obok swojego pliku, a po zbundlowaniu
// przez Turbopack ich tam nie ma. Kopiujemy samodzielne pliki workerów do public/ i wskazujemy je
// wprost (components/map/maplibre.ts, components/attachments/pdf.ts).
import { copyFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const workers = {
  'maplibre-gl-worker.mjs': 'maplibre-gl/dist/maplibre-gl-worker.mjs',
  'pdf.worker.min.mjs': 'pdfjs-dist/build/pdf.worker.min.mjs',
}
mkdirSync(new URL('../public/', import.meta.url), { recursive: true })
for (const [target, source] of Object.entries(workers)) {
  copyFileSync(require.resolve(source), new URL(`../public/${target}`, import.meta.url))
}

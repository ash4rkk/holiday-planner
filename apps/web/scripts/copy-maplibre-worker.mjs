// MapLibre szuka swojego workera obok własnego pliku, a po zbundlowaniu przez Turbopack go tam nie ma.
// Kopiujemy samodzielny worker do public/ i wskazujemy go przez setWorkerUrl (components/map/maplibre.ts).
import { copyFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const source = require.resolve('maplibre-gl/dist/maplibre-gl-worker.mjs')
mkdirSync(new URL('../public/', import.meta.url), { recursive: true })
copyFileSync(source, new URL('../public/maplibre-gl-worker.mjs', import.meta.url))

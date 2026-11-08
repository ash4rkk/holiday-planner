import { fileURLToPath } from 'node:url'
import { withSerwist } from '@serwist/turbopack'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: fileURLToPath(new URL('../..', import.meta.url)),
  transpilePackages: ['@planer/core'],
  poweredByHeader: false,
  // Router trzyma ostatnie widoki ukryte w <Activity> zamiast je odmontowywać: powrót na Listę
  // albo Tablicę zachowuje stan i przewinięcie. Strony bez danych z zapytania czekają na
  // connection(), żeby nie pytały bazy przy buildzie.
  cacheComponents: true,
  // Pobieranie z wyprzedzeniem obejmuje też dane strony (dotychczasowe zachowanie Next).
  partialPrefetching: false,
  // next dev blokuje zasoby /_next (HMR, chunki) dla innych hostów niż localhost — telefon w sieci lokalnej.
  allowedDevOrigins: ['192.168.*.*', '10.*.*.*', '*.local'],
  // Chromium do PDF i sharp uruchamiane z node_modules, nie bundlowane.
  serverExternalPackages: ['playwright-core', 'sharp'],
  // playwright-core czyta przy starcie pliki JSON (browsers.json), których śledzenie importów nie widzi.
  outputFileTracingIncludes: {
    '/api/export/\\[tripId\\]': [
      '../../node_modules/.pnpm/playwright-core@*/node_modules/playwright-core/**/*',
    ],
  },
  // proxy.ts buforuje ciało żądania; uploady plików do 20 MB (lib/attachments.ts).
  experimental: {
    proxyClientMaxBodySize: '21mb',
    // Powrót do widoku odwiedzonego przed chwilą idzie z pamięci routera, bez pytania serwera.
    // Widoki wyjazdu i tak czytają dane z dokumentu Yjs na telefonie.
    staleTimes: { dynamic: 30 },
  },
  // Załączniki i eksport ustawiają własne, ostrzejsze CSP w trasach.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
          },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ]
  },
}

export default withSerwist(nextConfig)

import { fileURLToPath } from 'node:url'
import { withSerwist } from '@serwist/turbopack'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: fileURLToPath(new URL('../..', import.meta.url)),
  transpilePackages: ['@planer/core'],
  poweredByHeader: false,
  // Chromium do PDF i sharp uruchamiane z node_modules, nie bundlowane.
  serverExternalPackages: ['playwright-core', 'sharp'],
  // playwright-core czyta przy starcie pliki JSON (browsers.json), których śledzenie importów nie widzi.
  outputFileTracingIncludes: {
    '/api/export/\\[tripId\\]': [
      '../../node_modules/.pnpm/playwright-core@*/node_modules/playwright-core/**/*',
    ],
  },
  // proxy.ts buforuje ciało żądania; uploady plików do 20 MB (lib/attachments.ts).
  experimental: { proxyClientMaxBodySize: '21mb' },
}

export default withSerwist(nextConfig)

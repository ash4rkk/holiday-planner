import { fileURLToPath } from 'node:url'
import { withSerwist } from '@serwist/turbopack'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: fileURLToPath(new URL('../..', import.meta.url)),
  transpilePackages: ['@planer/core'],
  poweredByHeader: false,
  // proxy.ts buforuje ciało żądania; uploady plików do 20 MB (lib/attachments.ts).
  experimental: { proxyClientMaxBodySize: '21mb' },
}

export default withSerwist(nextConfig)

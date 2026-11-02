import { fileURLToPath } from 'node:url'
import { withSerwist } from '@serwist/turbopack'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: fileURLToPath(new URL('../..', import.meta.url)),
  transpilePackages: ['@planer/core'],
  poweredByHeader: false,
}

export default withSerwist(nextConfig)

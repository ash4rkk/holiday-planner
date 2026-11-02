import { createSerwistRoute } from '@serwist/turbopack'

// Service worker budowany z app/sw.ts i serwowany jako /serwist/sw.js (Turbopack nie ma pluginów).
export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute(
  {
    swSrc: 'app/sw.ts',
    useNativeEsbuild: true,
    additionalPrecacheEntries: [{ url: '/offline', revision: 'offline-1' }],
  },
)

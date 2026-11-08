import { createSerwistRoute } from '@serwist/turbopack'

// Service worker budowany z app/sw.ts i serwowany jako /serwist/sw.js (Turbopack nie ma pluginów).
// Bez dynamic/dynamicParams/revalidate z Serwista — przy cacheComponents Next ich nie przyjmuje;
// generateStaticParams i tak robi z tego statyczne pliki.
export const { generateStaticParams, GET } = createSerwistRoute({
  swSrc: 'app/sw.ts',
  useNativeEsbuild: true,
  additionalPrecacheEntries: [{ url: '/offline', revision: 'offline-1' }],
})

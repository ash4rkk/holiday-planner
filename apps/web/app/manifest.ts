import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Planer wakacji',
    short_name: 'Planer',
    description: 'Wspólny planer wyjazdów',
    lang: 'pl',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f3f1ed',
    theme_color: '#1e1e22',
    // Jeden cel dla linków z Google Maps i dla zdjęć/PDF-ów (import AI w etapie 7).
    share_target: {
      action: '/share/receive',
      method: 'POST',
      enctype: 'multipart/form-data',
      params: {
        title: 'title',
        text: 'text',
        url: 'url',
        files: [{ name: 'files', accept: ['image/*', 'application/pdf'] }],
      },
    },
    icons: [
      { src: '/icons/192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}

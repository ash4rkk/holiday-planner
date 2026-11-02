import type { Metadata, Viewport } from 'next'
import { Atkinson_Hyperlegible } from 'next/font/google'
import { ThemeProvider } from 'next-themes'
import type { ReactNode } from 'react'
import { ServiceWorker } from '@/components/pwa/sw-register'
import './globals.css'

const atkinson = Atkinson_Hyperlegible({
  weight: ['400', '700'],
  style: ['normal', 'italic'],
  subsets: ['latin', 'latin-ext'],
  variable: '--font-atkinson',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Planer',
  description: 'Planer wakacji',
  applicationName: 'Planer',
  appleWebApp: { capable: true, title: 'Planer', statusBarStyle: 'black-translucent' },
  icons: { icon: '/icons/192.png', apple: '/icons/apple-180.png' },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f3f1ed' },
    { media: '(prefers-color-scheme: dark)', color: '#1e1e22' },
  ],
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pl" className={atkinson.variable} suppressHydrationWarning>
      <body>
        <ServiceWorker>
          <ThemeProvider attribute="data-theme" defaultTheme="system" enableSystem>
            {children}
          </ThemeProvider>
        </ServiceWorker>
      </body>
    </html>
  )
}

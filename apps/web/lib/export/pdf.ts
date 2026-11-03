import 'server-only'
import { existsSync } from 'node:fs'
import { chromium } from 'playwright-core'

// PDF z HTML do druku przez Chromium na serwerze (w obrazie: apk chromium). Renderujemy tylko
// nasz własny HTML: JavaScript wyłączony, z sieci wolno pobrać jedynie krój pisma z Google Fonts.

const CANDIDATES = ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome']

function chromiumPath(): string {
  const configured = process.env.CHROMIUM_PATH
  if (configured) return configured
  const found = CANDIDATES.find((p) => existsSync(p))
  if (!found) throw new Error('brak Chromium (CHROMIUM_PATH)')
  return found
}

export async function htmlToPdf(html: string, title: string): Promise<Buffer> {
  const browser = await chromium.launch({
    executablePath: chromiumPath(),
    // W kontenerze bez przestrzeni nazw użytkownika sandbox Chromium nie wstaje; treść jest nasza.
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  })
  try {
    const page = await browser.newPage({ javaScriptEnabled: false })
    await page.route('**/*', (route) => {
      const host = new URL(route.request().url()).hostname
      if (host === 'fonts.googleapis.com' || host === 'fonts.gstatic.com') return route.continue()
      return route.abort()
    })
    await page.setContent(html, { waitUntil: 'networkidle', timeout: 20_000 }).catch(() => {})
    return await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '14mm', bottom: '16mm', left: '14mm', right: '14mm' },
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: `<div style="font-size:8px;color:#888;width:100%;padding:0 14mm;display:flex;justify-content:space-between"><span>${title.replace(/</g, '&lt;')}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
    })
  } finally {
    await browser.close()
  }
}

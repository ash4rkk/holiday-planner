import { exportHtml, exportMarkdown } from '@planer/core'
import { getCurrentUser } from '@/lib/auth/user'
import { buildExport, fileSlug } from '@/lib/export/build'
import { htmlToPdf } from '@/lib/export/pdf'
import { getTrip } from '@/lib/trips'

/** Eksport wyjazdu: ?format=md (plik), html (widok do druku), pdf (plik z Chromium na serwerze). */
export async function GET(request: Request, { params }: RouteContext<'/api/export/[tripId]'>) {
  await getCurrentUser()
  const trip = await getTrip((await params).tripId)
  if (!trip) return new Response('nie ma takiego wyjazdu', { status: 404 })
  const format = new URL(request.url).searchParams.get('format') ?? 'html'
  const { model, rate, today } = await buildExport(trip)
  const name = fileSlug(trip.title)

  if (format === 'md') {
    return new Response(exportMarkdown(model, rate, today), {
      headers: {
        'content-type': 'text/markdown; charset=utf-8',
        'content-disposition': `attachment; filename="${name}.md"`,
        'cache-control': 'no-store',
      },
    })
  }
  const html = exportHtml(model, rate, today, { printButton: format !== 'pdf' })
  if (format === 'pdf') {
    try {
      const pdf = await htmlToPdf(html, trip.title)
      return new Response(new Uint8Array(pdf), {
        headers: {
          'content-type': 'application/pdf',
          'content-disposition': `attachment; filename="${name}.pdf"`,
          'cache-control': 'no-store',
        },
      })
    } catch (error) {
      console.warn('[export] pdf', String(error))
      return new Response('nie udało się przygotować PDF — użyj widoku do druku', { status: 503 })
    }
  }
  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      // Treść kart jest od użytkowników — w widoku druku żadnych skryptów poza przyciskiem „drukuj”.
      'content-security-policy':
        "default-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'unsafe-hashes' 'sha256-MguIPR6qNR8D3B+eAlK+bIRTZe8t3wkOY4B/56Me9FU='; img-src 'none'",
    },
  })
}

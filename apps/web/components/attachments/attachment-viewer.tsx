'use client'

import { type AttachmentMeta, attachmentUrl, formatSize, isPdf } from '@planer/core'
import { ExternalLink, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { askConfirm } from '@/components/confirm-dialog'
import { loadPdfJs } from './pdf'

/**
 * Pełnoekranowy podgląd załącznika. PDF rysowany w aplikacji (PDF.js), bo Chrome na Androidzie nie
 * wyświetla PDF-ów sam — a tak bilet otwiera się też offline, z pamięci service workera.
 */
export function AttachmentViewer({
  attachment,
  onClose,
  onDelete,
}: {
  attachment: AttachmentMeta
  onClose: () => void
  onDelete: () => void
}) {
  const url = attachmentUrl(attachment.id)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={attachment.name}
      className="fixed inset-0 z-(--z-dialog) flex flex-col bg-bg"
    >
      <div className="flex shrink-0 items-center gap-1 px-px pt-1">
        <button
          type="button"
          onClick={onClose}
          aria-label="zamknij podgląd"
          className="island flex size-11 items-center justify-center text-muted hover:text-accent"
        >
          <X className="size-5" aria-hidden="true" />
        </button>
        <div className="island flex min-h-11 min-w-0 flex-1 flex-col justify-center px-3">
          <span className="truncate text-sm font-bold text-teal">{attachment.name}</span>
          <span className="text-2xs text-subtle italic">{formatSize(attachment.size)}</span>
        </div>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          aria-label="otwórz osobno"
          className="island flex size-11 items-center justify-center text-muted hover:text-accent"
        >
          <ExternalLink className="size-5" aria-hidden="true" />
        </a>
        <button
          type="button"
          onClick={async () => {
            const ok = await askConfirm({
              title: 'odłączyć plik?',
              body: 'Plik zniknie z karty i z serwera.',
              confirm: 'odłącz',
              danger: true,
            })
            if (ok) onDelete()
          }}
          aria-label="odłącz plik"
          className="island flex size-11 items-center justify-center text-muted hover:text-red"
        >
          <Trash2 className="size-5" aria-hidden="true" />
        </button>
      </div>
      <div className="mt-1 flex-1 overflow-auto" style={{ touchAction: 'pan-x pan-y pinch-zoom' }}>
        {isPdf(attachment.mime) ? (
          <PdfPages url={url} />
        ) : (
          <img
            src={url}
            alt={attachment.name}
            className="mx-auto max-h-full max-w-full object-contain"
          />
        )}
      </div>
    </div>
  )
}

function PdfPages({ url }: { url: string }) {
  const container = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    let cancelled = false
    const target = container.current
    void (async () => {
      try {
        const pdfjs = await loadPdfJs()
        const data = await (await fetch(url)).arrayBuffer()
        const pdf = await pdfjs.getDocument({ data }).promise
        const width = (target?.clientWidth ?? 400) - 8
        for (let n = 1; n <= pdf.numPages && !cancelled; n++) {
          const page = await pdf.getPage(n)
          const base = page.getViewport({ scale: 1 })
          // Ostrość na ekranach o wysokim DPI: rysujemy w pikselach urządzenia.
          const ratio = window.devicePixelRatio || 1
          const viewport = page.getViewport({ scale: (width / base.width) * ratio })
          const canvas = document.createElement('canvas')
          canvas.width = viewport.width
          canvas.height = viewport.height
          canvas.style.width = `${viewport.width / ratio}px`
          canvas.className = 'mx-auto mb-1 rounded-small bg-white'
          canvas.setAttribute('aria-label', `strona ${n}`)
          await page.render({ canvas, viewport }).promise
          target?.append(canvas)
        }
        if (!cancelled) setState('ready')
      } catch {
        if (!cancelled) setState('error')
      }
    })()
    return () => {
      cancelled = true
      if (target) target.innerHTML = ''
    }
  }, [url])

  return (
    <>
      {state === 'loading' && (
        <p className="p-4 text-center text-sm text-subtle italic">otwieram PDF…</p>
      )}
      {state === 'error' && (
        <p className="island m-1 p-4 text-sm">
          <span className="text-red">●</span> nie udało się otworzyć pliku — bez zasięgu działa
          tylko, jeśli był już pobrany
        </p>
      )}
      <div ref={container} className="px-1" />
    </>
  )
}

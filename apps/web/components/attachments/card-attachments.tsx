'use client'

import { attachFile, attachmentUrl, detachFile, formatSize, isImage } from '@planer/core'
import { FileText, Paperclip } from 'lucide-react'
import { useRef, useState } from 'react'
import { useAttachments, useTrip } from '@/lib/yjs/trip-doc'
import { AttachmentViewer } from './attachment-viewer'

/** Pliki karty: miniatury, dodawanie (zdjęcie, PDF), pełnoekranowy podgląd. */
export function CardAttachments({ cardId }: { cardId: string }) {
  const { trip, doc } = useTrip()
  const files = useAttachments().filter((a) => a.cardId === cardId)
  const input = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<{ busy: boolean; error?: string }>({ busy: false })
  const [open, setOpen] = useState<string | null>(null)
  const opened = files.find((f) => f.id === open)

  const upload = async (list: FileList | null) => {
    if (!list?.length) return
    setState({ busy: true })
    try {
      for (const file of Array.from(list)) {
        const form = new FormData()
        form.set('tripId', trip.id)
        form.set('file', file)
        const res = await fetch('/api/attachments', { method: 'POST', body: form })
        const body = await res.json().catch(() => ({ error: 'brak odpowiedzi serwera' }))
        if (!res.ok) throw new Error(body.error ?? 'nie udało się wysłać pliku')
        attachFile(doc, { ...body, cardId })
        // Od razu do pamięci offline (plik jest niezmienny).
        void caches
          ?.open('attachments')
          .then((c) => c.add(attachmentUrl(body.id)))
          .catch(() => {})
      }
      setState({ busy: false })
    } catch (error) {
      const offline = typeof navigator !== 'undefined' && !navigator.onLine
      setState({
        busy: false,
        error: offline ? 'dodawanie plików wymaga zasięgu' : (error as Error).message,
      })
    } finally {
      if (input.current) input.current.value = ''
    }
  }

  return (
    <div className="flex flex-col gap-2 border-t border-line px-4 py-3">
      {files.length > 0 && (
        <div className="grid grid-cols-3 gap-1">
          {files.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setOpen(f.id)}
              className="flex aspect-square flex-col overflow-hidden rounded-small border border-line bg-raised text-left"
            >
              {isImage(f.mime) ? (
                <img
                  src={attachmentUrl(f.id)}
                  alt=""
                  loading="lazy"
                  className="min-h-0 flex-1 object-cover"
                />
              ) : (
                <span className="flex flex-1 items-center justify-center text-teal">
                  <FileText className="size-8" aria-hidden="true" />
                </span>
              )}
              <span className="truncate px-1.5 py-1 text-2xs text-teal">{f.name}</span>
              <span className="sr-only">{formatSize(f.size)}</span>
            </button>
          ))}
        </div>
      )}
      <input
        ref={input}
        type="file"
        accept="image/*,application/pdf"
        multiple
        className="hidden"
        onChange={(e) => void upload(e.target.files)}
      />
      <button
        type="button"
        disabled={state.busy}
        onClick={() => input.current?.click()}
        className="flex min-h-11 items-center gap-1 self-start rounded-small border border-line px-3 text-xs text-muted transition-colors hover:text-accent disabled:opacity-50"
      >
        <Paperclip className="size-3.5" aria-hidden="true" />
        {state.busy ? 'wysyłam…' : '+ plik (bilet, rezerwacja, paragon)'}
      </button>
      {state.error && <span className="text-xs text-red">● {state.error}</span>}
      {opened && (
        <AttachmentViewer
          attachment={opened}
          onClose={() => setOpen(null)}
          onDelete={() => {
            detachFile(doc, opened.id)
            setOpen(null)
          }}
        />
      )}
    </div>
  )
}

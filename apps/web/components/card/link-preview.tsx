import type { LinkPreview } from '@planer/core'
import { ExternalLink } from 'lucide-react'

/** Podgląd linku w karcie; dotknięcie otwiera stronę. */
export function LinkPreviewBlock({ preview }: { preview: LinkPreview }) {
  let host = preview.url
  try {
    host = new URL(preview.url).hostname.replace(/^www\./, '')
  } catch {}
  return (
    <a
      href={preview.url}
      target="_blank"
      rel="noreferrer noopener"
      className="mx-4 mb-3 flex flex-col overflow-hidden rounded-small border border-line bg-raised"
    >
      {preview.image && (
        <img
          src={preview.image}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="h-36 w-full object-cover"
        />
      )}
      <span className="flex flex-col gap-0.5 p-3">
        {preview.title && <span className="font-bold leading-snug">{preview.title}</span>}
        {preview.description && (
          <span className="line-clamp-3 text-xs text-muted">{preview.description}</span>
        )}
        <span className="mt-1 flex items-center gap-1 text-xs text-accent">
          <ExternalLink className="size-3" aria-hidden="true" />
          {preview.siteName ?? host}
        </span>
      </span>
    </a>
  )
}

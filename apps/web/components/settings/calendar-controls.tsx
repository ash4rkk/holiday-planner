'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'
import {
  deleteCalendar,
  renameCalendar,
  syncCalendarNow,
} from '@/app/(app)/settings/calendars/actions'
import { askConfirm, askText } from '@/components/confirm-dialog'
import { buttonClass } from '@/components/ui'

/** Zmiana nazwy, ponowny import / sync i usunięcie kalendarza. */
export function CalendarActions({
  id,
  name,
  source,
}: {
  id: string
  name: string
  source: 'ics' | 'timetree'
}) {
  const [pending, start] = useTransition()
  return (
    <div className="flex flex-wrap gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={async () => {
          const next = await askText({
            title: 'nazwa kalendarza',
            label: 'nazwa',
            value: name,
            confirm: 'zapisz',
          })
          if (next) start(() => renameCalendar(id, next))
        }}
        className={buttonClass('island', 'min-h-9 px-3 text-xs')}
      >
        zmień nazwę
      </button>
      {source === 'timetree' ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => start(() => syncCalendarNow(id))}
          className={buttonClass('island', 'min-h-9 px-3 text-xs')}
        >
          {pending ? 'pobieram…' : 'pobierz teraz'}
        </button>
      ) : (
        <IcsUpload calendarId={id} label="wgraj nowszy plik" small />
      )}
      <button
        type="button"
        disabled={pending}
        onClick={async () => {
          const ok = await askConfirm({
            title: 'usunąć kalendarz?',
            body: `„${name}” zniknie z planera razem z wydarzeniami. Wydarzeń w ${source === 'timetree' ? 'TimeTree' : 'pliku'} to nie zmienia.`,
            confirm: 'usuń',
            danger: true,
          })
          if (ok) start(() => deleteCalendar(id))
        }}
        className={buttonClass('danger', 'min-h-9 px-3 text-xs')}
      >
        usuń
      </button>
    </div>
  )
}

/** Wybór pliku .ics i wysłanie go od razu do importu. */
export function IcsUpload({
  calendarId,
  label = 'wgraj plik .ics',
  small,
}: {
  calendarId?: string
  label?: string
  small?: boolean
}) {
  const input = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const [status, setStatus] = useState<string>()
  const [busy, setBusy] = useState(false)
  const upload = async (file: File) => {
    setBusy(true)
    setStatus(undefined)
    const form = new FormData()
    form.set('file', file)
    if (calendarId) form.set('calendarId', calendarId)
    try {
      const res = await fetch('/api/calendars/import', { method: 'POST', body: form })
      const json = (await res.json()) as { error?: string; count?: number; truncated?: boolean }
      if (!res.ok) setStatus(`● ${json.error ?? 'import się nie udał'}`)
      else {
        setStatus(
          `zaimportowano ${json.count} wydarzeń${json.truncated ? ' (część pominięta — za dużo)' : ''}`,
        )
        router.refresh()
      }
    } catch {
      setStatus('● brak połączenia')
    }
    setBusy(false)
  }
  return (
    <>
      <input
        ref={input}
        type="file"
        accept=".ics,text/calendar"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) void upload(file)
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => input.current?.click()}
        className={small ? buttonClass('island', 'min-h-9 px-3 text-xs') : buttonClass('island')}
      >
        {busy ? 'importuję…' : label}
      </button>
      {status && <p className="w-full text-xs text-muted">{status}</p>}
    </>
  )
}

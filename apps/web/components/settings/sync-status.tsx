'use client'

import { useEffect, useState } from 'react'
import { cx } from '@/components/ui'
import { LAST_SYNC_KEY, syncUrl } from '@/lib/yjs/trip-doc'

type State = 'checking' | 'live' | 'offline'

function ago(ms: number): string {
  const min = Math.round((Date.now() - ms) / 60_000)
  if (min < 1) return 'przed chwilą'
  if (min < 60) return `${min} min temu`
  const at = new Date(ms)
  const time = at.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })
  return at.toDateString() === new Date().toDateString()
    ? `o ${time}`
    : `${at.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' })} ${time}`
}

/** Czy serwer sync odpowiada (próbne połączenie WebSocket) i kiedy ten telefon był ostatnio w zgodzie. */
export function SyncStatus() {
  const [state, setState] = useState<State>('checking')
  const [last, setLast] = useState<number>()

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LAST_SYNC_KEY)
      if (raw) setLast(Number(raw))
    } catch {}
    if (!navigator.onLine) {
      setState('offline')
      return
    }
    let done = false
    const ws = new WebSocket(syncUrl())
    const finish = (s: State) => {
      if (done) return
      done = true
      setState(s)
      ws.close()
    }
    ws.onopen = () => finish('live')
    ws.onerror = () => finish('offline')
    const timer = setTimeout(() => finish('offline'), 5000)
    return () => {
      clearTimeout(timer)
      done = true
      ws.close()
    }
  }, [])

  return (
    <span className="flex items-center gap-1.5 text-xs text-subtle">
      <span
        className={cx(
          'size-2 rounded-full',
          state === 'live' ? 'bg-green' : state === 'offline' ? 'bg-red' : 'bg-subtle',
        )}
        aria-hidden="true"
      />
      <span className={cx(state === 'live' && 'text-green', state === 'offline' && 'text-red')}>
        {state === 'live' ? 'na żywo' : state === 'offline' ? 'offline' : 'sprawdzam…'}
      </span>
      {last && <span>· ostatnia synchronizacja {ago(last)}</span>}
    </span>
  )
}

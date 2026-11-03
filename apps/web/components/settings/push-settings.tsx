'use client'

import { BellOff, BellRing } from 'lucide-react'
import { useEffect, useState } from 'react'
import { buttonClass, cx } from '@/components/ui'

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = `${base64}${'='.repeat((4 - (base64.length % 4)) % 4)}`
    .replace(/-/g, '+')
    .replace(/_/g, '/')
  const raw = atob(padded)
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

type State = 'unsupported' | 'loading' | 'off' | 'on' | 'denied'

/** Włączenie powiadomień na tym urządzeniu + zgoda na powiadomienia o zmianach drugiej osoby. */
export function PushSettings({ publicKey }: { publicKey?: string }) {
  const [state, setState] = useState<State>('loading')
  const [changes, setChanges] = useState(true)
  const [message, setMessage] = useState<string>()

  useEffect(() => {
    if (!publicKey || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      setState('unsupported')
      return
    }
    if (Notification.permission === 'denied') {
      setState('denied')
      return
    }
    void navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setState(sub ? 'on' : 'off'))
      .catch(() => setState('off'))
    try {
      setChanges(localStorage.getItem('planer-push-changes') !== 'false')
    } catch {}
  }, [publicKey])

  const save = async (sub: PushSubscription, notifyChanges: boolean) => {
    const json = sub.toJSON()
    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys, notifyChanges }),
    })
    if (!res.ok) throw new Error('serwer nie przyjął subskrypcji')
  }

  const enable = async () => {
    setMessage(undefined)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'denied' : 'off')
        return
      }
      const reg = await navigator.serviceWorker.ready
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey as string),
        }))
      await save(sub, changes)
      setState('on')
    } catch (error) {
      // Błędy przeglądarki są po angielsku; najczęstszy to brak usługi push (np. bez Usług Google).
      const name = (error as Error).name
      setMessage(
        name === 'NotAllowedError' || name === 'AbortError'
          ? '● przeglądarka nie zarejestrowała powiadomień — spróbuj w zainstalowanej aplikacji'
          : '● nie udało się włączyć powiadomień',
      )
    }
  }

  const disable = async () => {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (sub) {
      await fetch('/api/push/subscribe', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      }).catch(() => {})
      await sub.unsubscribe()
    }
    setState('off')
  }

  const toggleChanges = async (value: boolean) => {
    setChanges(value)
    try {
      localStorage.setItem('planer-push-changes', String(value))
    } catch {}
    const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription()
    if (sub) await save(sub, value).catch(() => setMessage('● nie udało się zapisać'))
  }

  const test = async () => {
    const res = await fetch('/api/push/test', { method: 'POST' }).catch(() => null)
    const sent = res?.ok ? ((await res.json()) as { sent: number }).sent : 0
    setMessage(
      sent
        ? `• wysłano na ${sent} urządz.`
        : '● nic nie wysłano — sprawdź klucze VAPID na serwerze',
    )
  }

  return (
    <section className="island flex flex-col gap-3 p-4">
      <div className="flex items-start gap-3">
        {state === 'on' ? (
          <BellRing className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden="true" />
        ) : (
          <BellOff className="mt-0.5 size-5 shrink-0 text-muted" aria-hidden="true" />
        )}
        <div className="text-sm">
          <p className="font-bold">powiadomienia na tym telefonie</p>
          <p className="text-xs text-subtle italic">
            przypomnienia z kart z datą i godziną (np. 3 h przed lotem) i zmiany drugiej osoby
          </p>
        </div>
      </div>
      {state === 'unsupported' && (
        <p className="text-sm text-muted">
          ● ta przeglądarka nie obsługuje powiadomień albo serwer nie ma kluczy VAPID
        </p>
      )}
      {state === 'denied' && (
        <p className="text-sm text-muted">
          ● powiadomienia są zablokowane w ustawieniach przeglądarki dla tej strony
        </p>
      )}
      {state === 'off' && (
        <button type="button" onClick={enable} className={buttonClass('primary')}>
          włącz powiadomienia
        </button>
      )}
      {state === 'on' && (
        <>
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={changes}
              onChange={(e) => void toggleChanges(e.target.checked)}
              className={cx('size-5 accent-[var(--accent)]')}
            />
            zmiany drugiej osoby w planie
          </label>
          <div className="grid grid-cols-2 gap-1">
            <button type="button" onClick={test} className={buttonClass('island')}>
              wyślij próbne
            </button>
            <button type="button" onClick={disable} className={buttonClass('island')}>
              wyłącz
            </button>
          </div>
        </>
      )}
      {message && <p className="text-xs text-subtle">{message}</p>}
    </section>
  )
}

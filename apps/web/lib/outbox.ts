import { type OutboxShare, shareStore } from './share-store'

/** Wysyła zaległe udostępnienia do skrzynek; zwraca liczbę wysłanych. Błąd sieci = zostają na później. */
export async function flushOutbox(): Promise<number> {
  let sent = 0
  for (const item of await shareStore.all('outbox')) {
    if (!(await sendShare(item))) break
    await shareStore.delete('outbox', item.clientKey)
    sent++
  }
  return sent
}

async function sendShare(item: OutboxShare): Promise<boolean> {
  try {
    const res = await fetch('/api/inbox', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(item),
      redirect: 'manual',
    })
    // 4xx z danych (np. usunięty wyjazd) nie zniknie od ponawiania — porzucamy wpis.
    if (res.status >= 400 && res.status < 500 && res.status !== 401 && res.status !== 403)
      return true
    return res.ok
  } catch {
    return false
  }
}

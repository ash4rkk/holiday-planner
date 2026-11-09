'use client'

import { useEffect, useState } from 'react'

/** Stan powiadomień na tym urządzeniu jako wartość w wierszu ustawień. */
export function PushValue() {
  const [value, setValue] = useState<string>()
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setValue('niedostępne')
      return
    }
    if (Notification.permission === 'denied') {
      setValue('zablokowane')
      return
    }
    // Bez zarejestrowanego service workera (np. `next dev`) `ready` nigdy się nie spełnia.
    const timer = setTimeout(() => setValue((v) => v ?? 'wyłączone'), 3000)
    void navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setValue(sub ? 'włączone' : 'wyłączone'))
      .catch(() => setValue('wyłączone'))
    return () => clearTimeout(timer)
  }, [])
  // Od razu coś w wierszu: sprawdzenie subskrypcji trwa chwilę, a pusty wiersz wygląda na błąd.
  return value ?? 'sprawdzam…'
}

'use client'

import { useEffect, useState } from 'react'

const THRESHOLD = 6

/**
 * true = menu schowane (przewijanie w dół). Pasywny nasłuch na oknie, rAF, próg ok. 6 px.
 * Zmiana `resetKey` (ścieżka) pokazuje menu od nowa.
 */
export function useScrollHidden(enabled: boolean, resetKey?: string): boolean {
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    setHidden(false)
    if (!enabled) return
    let last = window.scrollY
    let frame = 0
    const update = () => {
      frame = 0
      const y = window.scrollY
      const atBottom = window.innerHeight + y >= document.documentElement.scrollHeight - 2
      if (y < 24 || atBottom) setHidden(false)
      else if (y - last > THRESHOLD) setHidden(true)
      else if (last - y > THRESHOLD) setHidden(false)
      if (Math.abs(y - last) > THRESHOLD) last = y
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    // Klawiatura zmienia visualViewport — wtedy menu wraca.
    const onResize = () => setHidden(false)
    window.addEventListener('scroll', onScroll, { passive: true })
    window.visualViewport?.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.visualViewport?.removeEventListener('resize', onResize)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [enabled, resetKey])

  return hidden
}

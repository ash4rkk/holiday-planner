import { type RefCallback, type RefObject, useCallback } from 'react'
import { crossfade, reducedMotion } from './motion'

type Exit = 'fade' | 'pop' | 'sheet' | 'panel-left'

const MS = 160
const EASE = 'cubic-bezier(0.4, 0, 1, 1)'

/**
 * Wyjście okna bez czekania: React usuwa je od razu (niczego nie blokuje), a w jego miejscu przez
 * chwilę gaśnie nieklikalna kopia. Widok schowany przez router (<Activity>) i podwójne efekty
 * StrictMode zostawiają element w dokumencie, więc wtedy kopii nie ma.
 */
function ghost(el: HTMLElement, kind: Exit) {
  const rect = el.getBoundingClientRect()
  if (!rect.width || !rect.height) return
  const style = getComputedStyle(el)
  const scrolled: [number, number][] = []
  el.querySelectorAll('*').forEach((n, i) => {
    if (n.scrollTop) scrolled.push([i, n.scrollTop])
  })
  const { opacity } = style
  const theme = el.closest('[data-theme]')?.getAttribute('data-theme')
  queueMicrotask(() => {
    if (el.isConnected) return
    const copy = el.cloneNode(true) as HTMLElement
    copy.classList.add('exit-ghost')
    copy.setAttribute('aria-hidden', 'true')
    copy.inert = true
    copy.removeAttribute('id')
    if (theme) copy.dataset.theme = theme
    Object.assign(copy.style, {
      position: 'fixed',
      inset: 'auto',
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      margin: '0',
      translate: 'none',
      transform: 'none',
      zIndex: 'var(--z-dialog)',
      pointerEvents: 'none',
    })
    document.body.append(copy)
    const all = copy.querySelectorAll('*')
    for (const [i, top] of scrolled) {
      const n = all[i]
      if (n) n.scrollTop = top
    }
    const done = () => copy.remove()
    if (reducedMotion()) {
      setTimeout(done, crossfade(copy, false))
      return
    }
    const opts = { duration: MS, easing: EASE, fill: 'forwards' } as const
    copy.animate({ opacity: [opacity, '0'] }, opts)
    if (kind === 'pop') {
      const inner = copy.querySelector('.pop-in') ?? copy
      inner.animate({ scale: [1, 0.96] }, opts)
    } else if (kind === 'sheet') {
      copy.querySelector('.sheet-in')?.animate({ translate: ['0', '0 40%'] }, opts)
    } else if (kind === 'panel-left') {
      copy.querySelector('.panel-left-in')?.animate({ translate: ['0', '-40% 0'] }, opts)
    }
    setTimeout(done, MS)
  })
}

/** Ref na okno albo menu, które ma zgasnąć przy zamknięciu; `ref` dostaje ten sam element. */
export function useExit(
  kind: Exit = 'fade',
  ref?: RefObject<HTMLElement | null>,
): RefCallback<HTMLElement> {
  return useCallback(
    (el: HTMLElement | null) => {
      if (!el) return
      if (ref) ref.current = el
      return () => {
        if (ref) ref.current = null
        ghost(el, kind)
      }
    },
    [kind, ref],
  )
}

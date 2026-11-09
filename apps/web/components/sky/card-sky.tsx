'use client'

import { useEffect, useRef } from 'react'
import { hexRgb, mixRgb, type SkyKind, type SkyPalette, SkyScene } from '@/lib/sky-scene'

// Tło karty w deszczu albo burzy: canvas ze sceną z lib/sky-scene.ts. Jedna wspólna pętla
// requestAnimationFrame dla wszystkich kart; rysowane są tylko karty widoczne na ekranie (ukryty
// widok routera i karty poza ekranem stoją). „Ogranicz ruch”: jedna nieruchoma klatka.

type Entry = { scene: SkyScene; ctx: CanvasRenderingContext2D; visible: boolean; kind: SkyKind }
const entries = new Set<Entry>()
let frame = 0
let last = 0

function loop(now: number) {
  const dt = last ? Math.min((now - last) / 1000, 0.05) : 0.016
  last = now
  for (const e of entries) {
    if (!e.visible) continue
    e.scene.step(dt)
    e.scene.draw(e.ctx)
  }
  frame = entries.size ? requestAnimationFrame(loop) : 0
  if (!frame) last = 0
}

function start() {
  if (!frame) frame = requestAnimationFrame(loop)
}

const WHITE: [number, number, number] = [255, 255, 255]

/** Kolory sceny z tokenów motywu (bieżący tryb). */
function palette(kind: SkyKind): SkyPalette {
  const css = getComputedStyle(document.documentElement)
  const v = (name: string) => hexRgb(css.getPropertyValue(name))
  const dark = document.documentElement.dataset.theme === 'dark'
  const blue = v('--blue')
  const sel = v('--sel')
  const muted = v('--muted')
  const storm = kind === 'storm'
  return {
    dark,
    drop: dark ? mixRgb(blue, WHITE, 0.35) : blue,
    cloudBack: dark ? mixRgb(sel, blue, 0.25) : mixRgb(sel, blue, 0.12),
    cloudFront: dark
      ? mixRgb(sel, storm ? [12, 12, 20] : muted, storm ? 0.05 : 0.18)
      : mixRgb(sel, muted, storm ? 0.45 : 0.25),
    // W jasnym trybie biała błyskawica ginie na białej karcie — tam poświata jest niebieska.
    flash: dark ? mixRgb(WHITE, blue, 0.18) : mixRgb(blue, WHITE, 0.2),
  }
}

let themeWatch: MutationObserver | null = null
function watchTheme() {
  if (themeWatch) return
  themeWatch = new MutationObserver(() => {
    for (const e of entries) e.scene.setPalette(palette(e.kind))
  })
  themeWatch.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  })
}

export function CardSky({ kind }: { kind: SkyKind }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const scene = new SkyScene(kind, palette(kind))
    const entry: Entry = { scene, ctx, visible: false, kind }
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    // Rozmiar z układu (clientWidth), nie z ekranu: Tablica skaluje karty transformacją.
    const fit = () => {
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      if (!w || !h) return
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      scene.resize(w, h)
      if (still) {
        // Jedna klatka „w biegu”: krople rozłożone, bez ruchu i błysków.
        for (let i = 0; i < 30; i++) scene.step(0.016)
        scene.draw(ctx)
      }
    }
    const resize = new ResizeObserver(fit)
    resize.observe(canvas)
    fit()

    const seen = new IntersectionObserver(([e]) => {
      entry.visible = Boolean(e?.isIntersecting)
    })
    seen.observe(canvas)

    watchTheme()
    if (!still) {
      entries.add(entry)
      start()
    }
    return () => {
      resize.disconnect()
      seen.disconnect()
      entries.delete(entry)
    }
  }, [kind])

  return (
    <span className="card-sky" aria-hidden="true">
      <canvas ref={ref} className="block size-full" />
    </span>
  )
}

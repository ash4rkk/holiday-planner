import rough from 'roughjs'

// Szkicowe kształty (rough.js) jako ścieżki SVG; kolor nadaje komponent przez klasy.
const generator = rough.generator()

/** Stałe ziarno z id — kreska nie „drga” przy każdym renderze. */
export function seedOf(id: string): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619)
  return (h >>> 0) % 2_000_000_000 || 1
}

const base = { roughness: 1.1, bowing: 1.2, strokeWidth: 1.5 }

export function sketchLine(x1: number, y1: number, x2: number, y2: number, seed: number): string[] {
  return generator.toPaths(generator.line(x1, y1, x2, y2, { ...base, seed })).map((p) => p.d)
}

export function sketchArrowHead(x: number, y: number, angle: number, seed: number): string[] {
  const len = 12
  const spread = Math.PI / 7
  return [angle + Math.PI - spread, angle + Math.PI + spread].flatMap((a, i) =>
    sketchLine(x, y, x + len * Math.cos(a), y + len * Math.sin(a), seed + i + 1),
  )
}

export function sketchRect(w: number, h: number, seed: number): string[] {
  return generator
    .toPaths(generator.rectangle(2, 2, w - 4, h - 4, { ...base, roughness: 0.9, seed }))
    .map((p) => p.d)
}

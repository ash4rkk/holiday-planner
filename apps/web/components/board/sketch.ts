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

type Point = { x: number; y: number }

/** Szkicowa krzywa Béziera — strzałka omijająca karty. */
export function sketchCurve(a: Point, c1: Point, c2: Point, b: Point, seed: number): string[] {
  const d = `M${a.x},${a.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${b.x},${b.y}`
  return generator.toPaths(generator.path(d, { ...base, seed })).map((p) => p.d)
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

/** Zaokrąglona ołówkowa ramka; rough.js rysuje ją dwiema kreskami. */
export function sketchRoundRect(w: number, h: number, seed: number, r = 14): string[] {
  const x = 3
  const y = 3
  const right = w - 3
  const bottom = h - 3
  const d = [
    `M${x + r},${y}`,
    `L${right - r},${y}`,
    `Q${right},${y} ${right},${y + r}`,
    `L${right},${bottom - r}`,
    `Q${right},${bottom} ${right - r},${bottom}`,
    `L${x + r},${bottom}`,
    `Q${x},${bottom} ${x},${bottom - r}`,
    `L${x},${y + r}`,
    `Q${x},${y} ${x + r},${y}`,
  ].join(' ')
  return generator
    .toPaths(generator.path(d, { ...base, roughness: 1.2, bowing: 1.6, seed }))
    .map((p) => p.d)
}

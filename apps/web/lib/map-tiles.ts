import { distanceKm, type LatLng } from '@planer/core'

// Kafelki mapy do pobrania offline, w trzech warstwach, żeby nie pobierać pustych obszarów między
// miastami (np. lotnisko w Warszawie i plan w Lizbonie):
// - zarys całego wyjazdu tylko do WORLD_ZOOM (kilkadziesiąt kafelków),
// - okolica każdego skupiska miejsc (miasto) do OVERVIEW_ZOOM,
// - szczegóły ulic tylko w promieniu DETAIL_RADIUS_KM od miejsc z kart.

export const WORLD_ZOOM = 6
export const OVERVIEW_ZOOM = 11
export const MAX_ZOOM = 14
export const DETAIL_RADIUS_KM = 1.2
const MARGIN_KM = 3
const CLUSTER_KM = 30

export type Tile = { z: number; x: number; y: number }

function tileX(lng: number, z: number): number {
  return Math.floor(((lng + 180) / 360) * 2 ** z)
}
function tileY(lat: number, z: number): number {
  const r = (lat * Math.PI) / 180
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z)
}

/** Prostokąt w stopniach wokół punktu o promieniu w km. */
function around({ lat, lng }: LatLng, km: number) {
  const dLat = km / 111
  const dLng = km / (111 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)))
  return { south: lat - dLat, north: lat + dLat, west: lng - dLng, east: lng + dLng }
}

function rangeTiles(box: { south: number; north: number; west: number; east: number }, z: number) {
  const out: Tile[] = []
  const max = 2 ** z - 1
  const x0 = Math.max(0, tileX(box.west, z))
  const x1 = Math.min(max, tileX(box.east, z))
  const y0 = Math.max(0, tileY(box.north, z))
  const y1 = Math.min(max, tileY(box.south, z))
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push({ z, x, y })
  return out
}

type Box = { south: number; north: number; west: number; east: number }
const EMPTY: Box = { south: 90, north: -90, west: 180, east: -180 }
function boxOf(points: LatLng[], marginKm: number): Box {
  return points.reduce((b, p) => {
    const a = around(p, marginKm)
    return {
      south: Math.min(b.south, a.south),
      north: Math.max(b.north, a.north),
      west: Math.min(b.west, a.west),
      east: Math.max(b.east, a.east),
    }
  }, EMPTY)
}

/** Skupiska miejsc (miasta): miejsce dołącza do skupiska, gdy leży blisko któregoś z jego miejsc. */
export function clusters(places: LatLng[]): LatLng[][] {
  const groups: LatLng[][] = []
  for (const p of places) {
    const near = groups.find((g) => g.some((q) => distanceKm(p, q) <= CLUSTER_KM))
    if (near) near.push(p)
    else groups.push([p])
  }
  return groups
}

/** Kafelki dla miejsc wyjazdu, bez powtórzeń, od najmniejszego zoomu. */
export function tilesForPlaces(places: LatLng[], maxZoom = MAX_ZOOM): Tile[] {
  if (!places.length) return []
  const seen = new Set<string>()
  const out: Tile[] = []
  const add = (t: Tile) => {
    const key = `${t.z}/${t.x}/${t.y}`
    if (seen.has(key)) return
    seen.add(key)
    out.push(t)
  }
  const world = boxOf(places, MARGIN_KM)
  for (let z = 0; z <= Math.min(WORLD_ZOOM, maxZoom); z++)
    for (const t of rangeTiles(world, z)) add(t)
  for (const group of clusters(places)) {
    const box = boxOf(group, MARGIN_KM)
    for (let z = WORLD_ZOOM + 1; z <= Math.min(OVERVIEW_ZOOM, maxZoom); z++)
      for (const t of rangeTiles(box, z)) add(t)
  }
  for (let z = OVERVIEW_ZOOM + 1; z <= maxZoom; z++)
    for (const p of places) for (const t of rangeTiles(around(p, DETAIL_RADIUS_KM), z)) add(t)
  return out
}

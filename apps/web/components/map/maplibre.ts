'use client'

/** MapLibre ładowany leniwie (duży), z workerem z public/ (scripts/copy-workers.mjs). */
export async function loadMapLibre(): Promise<typeof import('maplibre-gl')> {
  const lib = await import('maplibre-gl')
  lib.setWorkerUrl(`/maplibre-gl-worker.mjs?v=${lib.getVersion()}`)
  return lib
}

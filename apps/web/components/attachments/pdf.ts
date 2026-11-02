'use client'

/** PDF.js ładowany leniwie, z workerem z public/ (scripts/copy-workers.mjs). */
export async function loadPdfJs(): Promise<typeof import('pdfjs-dist')> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = `/pdf.worker.min.mjs?v=${pdfjs.version}`
  return pdfjs
}

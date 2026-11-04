'use client'

import { CloudOff } from 'lucide-react'
import Link from 'next/link'
import { buttonClass } from '@/components/ui'

export default function ScreenError({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-[70dvh] max-w-xl flex-col items-center justify-center gap-3 p-6 text-center">
      <CloudOff className="size-10 text-accent" aria-hidden="true" strokeWidth={1.5} />
      <h1 className="text-xl font-bold">coś poszło nie tak</h1>
      <p className="text-sm text-muted">karty są bezpieczne na telefonie — spróbuj jeszcze raz</p>
      <div className="mt-2 grid grid-cols-2 gap-1">
        <button type="button" onClick={reset} className={buttonClass('primary')}>
          spróbuj ponownie
        </button>
        <Link href="/trips" className={buttonClass('island')}>
          wyjazdy
        </Link>
      </div>
    </main>
  )
}

import { Compass } from 'lucide-react'
import Link from 'next/link'
import { buttonClass } from '@/components/ui'

export default function NotFound() {
  return (
    <main className="app flex flex-col items-center justify-center gap-3 p-6 text-center">
      <Compass className="size-10 text-accent" aria-hidden="true" strokeWidth={1.5} />
      <h1 className="text-xl font-bold">nie ma tu takiej strony</h1>
      <p className="text-sm text-muted">wyjazd mógł zostać usunięty albo adres jest niepełny</p>
      <Link href="/trips" className={buttonClass('primary', 'mt-2')}>
        wróć do wyjazdów
      </Link>
    </main>
  )
}

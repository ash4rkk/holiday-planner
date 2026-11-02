import Link from 'next/link'

// Strona zapasowa SW, gdy ekranu nie ma w pamięci podręcznej i nie ma sieci.
export const dynamic = 'force-static'

export default function OfflinePage() {
  return (
    <main className="app mx-auto flex max-w-xl flex-col gap-1 px-0.5 pt-1">
      <div className="island p-4">
        <p className="font-bold">brak połączenia</p>
        <p className="mt-1 text-sm text-muted">
          Tego ekranu nie otwierano jeszcze na tym telefonie. Wyjazdy, które już były otwarte,
          działają offline.
        </p>
        <Link href="/trips" className="mt-3 inline-block text-sm text-accent">
          wyjazdy ›
        </Link>
      </div>
    </main>
  )
}

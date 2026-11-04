import { cx } from '@/components/ui'

/** Szkielet ekranu na czas odpowiedzi serwera: od razu widać, że tap zadziałał. */
export function ScreenSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-1" aria-busy="true" aria-label="ładowanie">
      <div className="island h-11" />
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className={cx(
            'island h-20 animate-pulse motion-reduce:animate-none',
            i === 0 && 'mt-1 h-28',
          )}
        />
      ))}
    </main>
  )
}

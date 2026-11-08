import { Settings2 } from 'lucide-react'
import Link from 'next/link'
import { cx } from '@/components/ui'

/** Ikona ustawień wyjazdu na liście wyjazdów — osobny link obok kafelka (nie w nim). */
export function TripSettingsLink({ tripId, className }: { tripId: string; className?: string }) {
  return (
    <Link
      href={`/trips/${tripId}/settings?from=trips`}
      aria-label="ustawienia wyjazdu"
      title="ustawienia wyjazdu"
      className={cx(
        'flex size-11 items-center justify-center text-muted transition-colors hover:text-accent',
        className,
      )}
    >
      <Settings2 className="size-5" aria-hidden="true" />
    </Link>
  )
}

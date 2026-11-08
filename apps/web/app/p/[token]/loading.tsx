import { ScreenSkeleton } from '@/components/skeleton'

// Granica Suspense dla planu z linku (dane z bazy na żądanie).
export default function Loading() {
  return <ScreenSkeleton />
}

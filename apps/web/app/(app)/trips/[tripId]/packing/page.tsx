import { asc, getDb, users } from '@planer/core/db'
import { Suspense } from 'react'
import { PackingList } from '@/components/packing/packing-list'

// Lista pakowania czyta imiona osób z bazy — wejście może chwilę poczekać.
export const instant = false

export default async function PackingPage({ params }: PageProps<'/trips/[tripId]/packing'>) {
  await params
  const people = await getDb()
    .select({ name: users.name })
    .from(users)
    .orderBy(asc(users.createdAt))
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-1">
      <Suspense>
        <PackingList people={people.map((p) => p.name)} />
      </Suspense>
    </main>
  )
}

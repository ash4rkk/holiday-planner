import { ThemeToggle } from '@/components/theme-toggle'
import { getCurrentUser } from '@/lib/auth/user'

export const dynamic = 'force-dynamic'

export default async function PulpitPage() {
  const user = await getCurrentUser()
  const today = new Intl.DateTimeFormat('pl-PL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date())

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-1">
      <header className="flex gap-1">
        <div className="island flex min-h-11 flex-1 items-center px-4">
          <h1 className="text-lg font-bold">dziś</h1>
          <span className="ml-auto text-xs text-subtle italic">{today}</span>
        </div>
        <ThemeToggle />
      </header>

      <section className="island border-t-2 border-t-accent p-4">
        <p className="text-xl font-bold">cześć, {user.name}</p>
        <p className="mt-1 text-xs text-subtle italic">{user.email}</p>
      </section>

      <section className="island p-4">
        <p className="text-sm text-muted">› brak wyjazdów — pierwszy dodasz w etapie 1</p>
      </section>
    </main>
  )
}

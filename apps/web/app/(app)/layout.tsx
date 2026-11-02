import type { ReactNode } from 'react'

export default function AppLayout({ children }: { children: ReactNode }) {
  return <div className="app px-0.5 pt-1 pb-[100px]">{children}</div>
}

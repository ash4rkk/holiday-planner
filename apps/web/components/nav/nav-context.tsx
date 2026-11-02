'use client'

import { usePathname } from 'next/navigation'
import { createContext, type ReactNode, useContext } from 'react'
import { useScrollHidden } from '@/lib/use-scroll-direction'

const NavHidden = createContext(false)

/** Na Tablicy i Mapie menu się nie chowa — przesuwanie palcem rusza widokiem. */
export function NavVisibility({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const pannable = /\/(board|map)$/.test(pathname)
  // Klucz ścieżki: zmiana ekranu = menu widoczne od nowa.
  const hidden = useScrollHidden(!pannable)
  return (
    <NavHidden.Provider key={pathname} value={hidden}>
      {children}
    </NavHidden.Provider>
  )
}

export function useNavHidden() {
  return useContext(NavHidden)
}

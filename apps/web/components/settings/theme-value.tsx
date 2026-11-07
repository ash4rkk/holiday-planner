'use client'

import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'

const LABELS: Record<string, string> = { light: 'jasny', dark: 'ciemny', system: 'jak w systemie' }

/** Wybrany motyw jako wartość w wierszu ustawień. */
export function ThemeValue() {
  const { theme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  return mounted && theme ? (LABELS[theme] ?? theme) : null
}

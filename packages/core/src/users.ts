// Kolory kursorów: akcent i błękit z motywu Vague (wariant ciemny).
const CURSOR_COLORS = ['#c48282', '#6e94b2', '#bb9dbd', '#e8b589'] as const

export function parseEmailList(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

/** `a@x.pl=Arek;b@x.pl=Ola` → mapa e-mail → imię */
export function parseUserNames(value: string | undefined): Map<string, string> {
  const map = new Map<string, string>()
  for (const pair of (value ?? '').split(';')) {
    const [email, name] = pair.split('=').map((s) => s.trim())
    if (email && name) map.set(email.toLowerCase(), name)
  }
  return map
}

export function defaultName(email: string): string {
  const local = email.split('@')[0] ?? email
  return local.charAt(0).toUpperCase() + local.slice(1)
}

export function cursorColor(email: string, allowed: string[]): string {
  const i = allowed.indexOf(email.toLowerCase())
  return CURSOR_COLORS[Math.max(i, 0) % CURSOR_COLORS.length] as string
}

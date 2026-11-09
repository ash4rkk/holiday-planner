// Kolory kursorów: akcent i błękit z motywu Vague (wariant ciemny).
// Kolory osób (kursory, awatary): bez kolorów stanów — bursztyn czy zieleń mówiłyby „uwaga” / „ok”.
const CURSOR_COLORS = ['#c48282', '#6e94b2', '#bb9dbd', '#aeaed1'] as const

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
  const address = email.toLowerCase()
  const i = allowed.indexOf(address)
  // Bez listy e-maili kolor z adresu, żeby dwie osoby nie dostały tego samego.
  const n = i >= 0 ? i : [...address].reduce((sum, c) => sum + c.charCodeAt(0), 0)
  return CURSOR_COLORS[n % CURSOR_COLORS.length] as string
}

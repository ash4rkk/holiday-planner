// Zapas bez service workera (np. pierwsze uruchomienie): dane w adresie, bez plików.
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null)
  const params = new URLSearchParams()
  for (const key of ['title', 'text', 'url']) {
    const value = form?.get(key)
    if (typeof value === 'string' && value.trim()) params.set(key, value.slice(0, 2000))
  }
  return Response.redirect(new URL(`/share?${params}`, request.url), 303)
}

import 'server-only'
import { cursorColor, defaultName, parseEmailList, parseUserNames } from '@planer/core'
import { eq, getDb, type User, users } from '@planer/core/db'
import { headers } from 'next/headers'
import { cache } from 'react'
import { USER_EMAIL_HEADER } from './access'

/** Zalogowana osoba; przy pierwszym wejściu zakładana w tabeli users. */
export const getCurrentUser = cache(async (): Promise<User> => {
  const email = (await headers()).get(USER_EMAIL_HEADER)
  if (!email) throw new Error('Brak zalogowanego użytkownika (proxy nie ustawiło e-maila)')

  const db = getDb()
  const [created] = await db
    .insert(users)
    .values({
      email,
      name: parseUserNames(process.env.USER_NAMES).get(email) ?? defaultName(email),
      color: cursorColor(email, parseEmailList(process.env.ALLOWED_EMAILS)),
    })
    .onConflictDoNothing({ target: users.email })
    .returning()
  if (created) return created

  const [existing] = await db.select().from(users).where(eq(users.email, email))
  if (!existing) throw new Error(`Nie znaleziono użytkownika ${email}`)
  return existing
})

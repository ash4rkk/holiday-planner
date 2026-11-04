import 'server-only'
import { parseUserNames } from '@planer/core'

export type Profile = { name: string; self: boolean }

/** Kafelki wyboru profilu: USER_NAMES i DEFAULT_PROFILE. Same imiona — e-maile nie idą do przeglądarki. */
export function listProfiles(me: string): Profile[] {
  const names = [
    ...parseUserNames(process.env.USER_NAMES).values(),
    process.env.DEFAULT_PROFILE,
    me,
  ].filter((name): name is string => Boolean(name))
  return [...new Set(names)].map((name) => ({ name, self: name === me }))
}

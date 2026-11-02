import { describe, expect, it } from 'vitest'
import { cursorColor, defaultName, parseEmailList, parseUserNames } from './users'

describe('users', () => {
  it('parsuje listę e-maili', () => {
    expect(parseEmailList(' A@x.pl, b@x.pl ,,')).toEqual(['a@x.pl', 'b@x.pl'])
    expect(parseEmailList(undefined)).toEqual([])
  })

  it('parsuje imiona', () => {
    const names = parseUserNames('A@x.pl=Arek; b@x.pl = Ola;zle')
    expect(names.get('a@x.pl')).toBe('Arek')
    expect(names.get('b@x.pl')).toBe('Ola')
    expect(names.size).toBe(2)
  })

  it('tworzy imię z e-maila', () => {
    expect(defaultName('arek@wiergowsky.com')).toBe('Arek')
  })

  it('przydziela różne kolory kursorów', () => {
    const allowed = ['a@x.pl', 'b@x.pl']
    expect(cursorColor('a@x.pl', allowed)).not.toBe(cursorColor('b@x.pl', allowed))
  })
})

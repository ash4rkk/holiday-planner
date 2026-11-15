import { describe, expect, it } from 'vitest'
import {
  diffLeave,
  leaveDayCounts,
  mergeSharedLeave,
  type PaintPeriod,
  paintLeave,
  periodLeaveDays,
  personLeaveDays,
} from './leave-paint'

let n = 0
const id = () => `new${++n}`
const p = (
  pid: string,
  startDate: string,
  endDate: string,
  note: string | null = null,
  person: string | null = null,
): PaintPeriod => ({
  id: pid,
  startDate,
  endDate,
  note,
  person,
  approved: false,
})

describe('paintLeave', () => {
  it('domalowanie do zatwierdzonego zostaje zatwierdzone, nowy okres nie', () => {
    const a = { ...p('a', '2027-05-01', '2027-05-03'), approved: true }
    expect(paintLeave([a], '2027-05-04', '2027-05-05', 'add', id).insert[0]?.approved).toBe(true)
    expect(paintLeave([], '2027-05-04', '2027-05-05', 'add', id).insert[0]?.approved).toBe(false)
    const cut = paintLeave([a], '2027-05-02', '2027-05-02', 'erase', id).insert
    expect(cut.map((x) => x.approved)).toEqual([true, true])
  })

  it('dodaje nowy okres (zakres w dowolną stronę)', () => {
    n = 0
    expect(paintLeave([], '2027-05-07', '2027-05-04', 'add', id)).toEqual({
      remove: [],
      insert: [p('new1', '2027-05-04', '2027-05-07')],
    })
  })

  it('łączy z nachodzącymi i stykającymi się okresami', () => {
    const a = p('a', '2027-05-01', '2027-05-03', 'majówka')
    const b = p('b', '2027-05-08', '2027-05-10', 'Gdańsk')
    const c = p('c', '2027-06-01', '2027-06-02')
    const res = paintLeave([a, b, c], '2027-05-04', '2027-05-07', 'add', id)
    expect(res.remove).toEqual([a, b])
    expect(res.insert).toEqual([p('a', '2027-05-01', '2027-05-10', 'majówka · Gdańsk')])
  })

  it('nic nie zmienia, gdy zakres jest już urlopem', () => {
    const a = p('a', '2027-05-01', '2027-05-10')
    expect(paintLeave([a], '2027-05-03', '2027-05-04', 'add', id)).toEqual({
      remove: [],
      insert: [],
    })
  })

  it('zmazuje: skraca, dzieli i usuwa', () => {
    n = 0
    const a = p('a', '2027-05-01', '2027-05-10', 'x')
    expect(paintLeave([a], '2027-05-01', '2027-05-03', 'erase', id).insert).toEqual([
      p('a', '2027-05-04', '2027-05-10', 'x'),
    ])
    expect(paintLeave([a], '2027-05-08', '2027-05-12', 'erase', id).insert).toEqual([
      p('a', '2027-05-01', '2027-05-07', 'x'),
    ])
    expect(paintLeave([a], '2027-05-04', '2027-05-05', 'erase', id).insert).toEqual([
      p('a', '2027-05-01', '2027-05-03', 'x'),
      p('new1', '2027-05-06', '2027-05-10', 'x'),
    ])
    expect(paintLeave([a], '2027-04-30', '2027-05-11', 'erase', id)).toEqual({
      remove: [a],
      insert: [],
    })
  })

  it('osoby: łączy i zmazuje tylko okresy tej samej osoby', () => {
    n = 0
    const shared = p('s', '2027-05-01', '2027-05-03')
    const arek = p('a', '2027-05-10', '2027-05-12', null, 'Arek')
    const add = paintLeave([shared, arek], '2027-05-04', '2027-05-09', 'add', id, 'Arek')
    expect(add.remove).toEqual([arek])
    expect(add.insert).toEqual([p('a', '2027-05-04', '2027-05-12', null, 'Arek')])
    const erase = paintLeave([shared, arek], '2027-05-01', '2027-05-12', 'erase', id, 'Wera')
    expect(erase).toEqual({ remove: [], insert: [] })
    const eraseAll = paintLeave([shared, arek], '2027-05-01', '2027-05-12', 'erase', id, null)
    expect(eraseAll.remove).toEqual([shared, arek])
  })
})

describe('personLeaveDays', () => {
  it('liczy wspólne i własne, nakładające się raz', () => {
    const periods = [
      { startDate: '2027-05-10', endDate: '2027-05-14', person: null },
      { startDate: '2027-05-12', endDate: '2027-05-18', person: 'Arek' },
      { startDate: '2027-06-07', endDate: '2027-06-08', person: 'Wera' },
    ]
    // Arek: 10–18 maja = 7 dni roboczych; Wera: 10–14 maja (5) + 7–8 czerwca (2)
    expect(personLeaveDays(periods, 'Arek', '2027-01-01', '2027-12-31', 'PL')).toBe(7)
    expect(personLeaveDays(periods, 'Wera', '2027-01-01', '2027-12-31', 'PL')).toBe(7)
  })
})

describe('regiony osób', () => {
  const regions = {
    fallback: 'PL' as const,
    byPerson: { Arek: 'PL' as const, Wera: 'DE-BB' as const },
  }
  const persons = ['Arek', 'Wera']

  it('wspólny okres liczy każdej osobie wg jej świąt', () => {
    // 21.12.2026–8.01.2027: Polska 11 dni, Brandenburgia 13 (Wigilia i 6.01 robocze)
    const shared = { startDate: '2026-12-21', endDate: '2027-01-08', person: null }
    expect(periodLeaveDays(shared, persons, regions)).toEqual([
      { person: 'Arek', days: 11 },
      { person: 'Wera', days: 13 },
    ])
    const same = { startDate: '2026-11-16', endDate: '2026-11-20', person: null }
    expect(periodLeaveDays(same, persons, regions)).toEqual([{ person: null, days: 5 }])
  })

  it('dzień wolny w urlopie: liczy się, gdy komuś to dzień roboczy', () => {
    const shared = [{ person: null }]
    expect(leaveDayCounts('2026-12-24', shared, persons, regions)).toBe(true) // Wera pracuje
    expect(leaveDayCounts('2026-12-25', shared, persons, regions)).toBe(false)
    expect(leaveDayCounts('2026-12-24', [{ person: 'Arek' }], persons, regions)).toBe(false)
    expect(leaveDayCounts('2026-12-26', shared, persons, regions)).toBe(false) // sobota
  })
})

describe('mergeSharedLeave', () => {
  const persons = ['Arek', 'Wera']
  const p = (
    id: string,
    s: string,
    e: string,
    person: string | null,
    note: string | null = null,
  ) => ({
    id,
    startDate: s,
    endDate: e,
    note,
    person,
    approved: false,
  })

  it('ten sam okres obu osób zamienia na wspólny', () => {
    const list = [
      p('w', '2027-08-30', '2027-09-10', 'Wera', 'Grecja'),
      p('a', '2027-08-30', '2027-09-10', 'Arek'),
      p('x', '2027-10-01', '2027-10-02', 'Arek'),
    ]
    const merged = mergeSharedLeave(list, persons)
    expect(merged).toEqual([
      p('w', '2027-08-30', '2027-09-10', null, 'Grecja'),
      p('x', '2027-10-01', '2027-10-02', 'Arek'),
    ])
    const change = diffLeave(list, merged)
    expect(change.remove.map((x) => x.id).sort()).toEqual(['a', 'w'])
    expect(change.insert).toEqual([p('w', '2027-08-30', '2027-09-10', null, 'Grecja')])
  })

  it('osoba z tym samym okresem co wspólny znika (zostaje wspólny)', () => {
    const list = [
      p('s', '2027-05-01', '2027-05-05', null),
      p('a', '2027-05-01', '2027-05-05', 'Arek'),
    ]
    expect(mergeSharedLeave(list, persons)).toEqual([p('s', '2027-05-01', '2027-05-05', null)])
  })

  it('wspólną część różnych dat wydziela jako wspólny okres', () => {
    let k = 0
    const nid = () => `n${++k}`
    const list = [
      p('a', '2027-05-01', '2027-05-10', 'Arek', 'Tatry'),
      p('w', '2027-05-05', '2027-05-15', 'Wera'),
    ]
    const merged = mergeSharedLeave(list, persons, nid)
    expect(merged).toEqual([
      p('a', '2027-05-01', '2027-05-04', 'Arek', 'Tatry'),
      p('n1', '2027-05-05', '2027-05-10', null, 'Tatry'),
      p('w', '2027-05-11', '2027-05-15', 'Wera'),
    ])
  })

  it('okres w środku drugiego: wspólny w środku, dwa kawałki osoby', () => {
    let k = 0
    const nid = () => `n${++k}`
    const list = [
      p('a', '2027-05-01', '2027-05-10', 'Arek'),
      p('w', '2027-05-04', '2027-05-06', 'Wera', 'ślub'),
    ]
    expect(mergeSharedLeave(list, persons, nid)).toEqual([
      p('a', '2027-05-01', '2027-05-03', 'Arek'),
      p('w', '2027-05-04', '2027-05-06', null, 'ślub'),
      p('n1', '2027-05-07', '2027-05-10', 'Arek'),
    ])
  })

  it('nowa wspólna część dokleja się do stykającego wspólnego', () => {
    const list = [
      p('s', '2027-05-01', '2027-05-03', null, 'majówka'),
      p('a', '2027-05-04', '2027-05-05', 'Arek'),
      p('w', '2027-05-04', '2027-05-07', 'Wera'),
    ]
    expect(mergeSharedLeave(list, persons)).toEqual([
      p('s', '2027-05-01', '2027-05-05', null, 'majówka'),
      p('w', '2027-05-06', '2027-05-07', 'Wera'),
    ])
  })

  it('status: kawałki dziedziczą, wspólna część zatwierdzona tylko z obu zatwierdzonych', () => {
    let k = 0
    const nid = () => `n${++k}`
    const ok = (x: ReturnType<typeof p>, approved: boolean) => ({ ...x, approved })
    const both = mergeSharedLeave(
      [
        ok(p('a', '2027-05-01', '2027-05-10', 'Arek'), true),
        ok(p('w', '2027-05-05', '2027-05-15', 'Wera'), true),
      ],
      persons,
      nid,
    )
    expect(both.map((x) => x.approved)).toEqual([true, true, true])
    const one = mergeSharedLeave(
      [
        ok(p('a', '2027-05-01', '2027-05-10', 'Arek'), true),
        ok(p('w', '2027-05-05', '2027-05-15', 'Wera'), false),
      ],
      persons,
      nid,
    )
    expect(one.map((x) => [x.person, x.approved])).toEqual([
      ['Arek', true],
      [null, false],
      ['Wera', false],
    ])
  })

  it('zmiana samego statusu jest zmianą do zapisu', () => {
    const before = [{ ...p('a', '2027-05-01', '2027-05-02', 'Arek'), approved: false }]
    const after = [{ ...before[0], approved: true }] as typeof before
    expect(diffLeave(before, after).insert).toEqual(after)
  })

  it('bez nakładania lista zostaje bez zmian', () => {
    const list = [
      p('w', '2027-08-30', '2027-09-10', 'Wera'),
      p('a', '2027-09-11', '2027-09-20', 'Arek'),
      p('s', '2027-10-01', '2027-10-02', null),
    ]
    expect(mergeSharedLeave(list, persons)).toBe(list)
  })
})

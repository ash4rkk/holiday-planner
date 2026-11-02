import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { attachFile, detachFile, formatSize, readAttachments } from './attachments'

describe('załączniki w dokumencie', () => {
  it('równoległe dodanie z dwóch urządzeń zachowuje oba pliki', () => {
    const a = new Y.Doc()
    const b = new Y.Doc()
    attachFile(a, {
      id: '1',
      cardId: 'c',
      name: 'bilet.pdf',
      mime: 'application/pdf',
      size: 1,
      createdAt: '2027-01-01T00:00:00Z',
    })
    attachFile(b, {
      id: '2',
      cardId: 'c',
      name: 'paragon.jpg',
      mime: 'image/jpeg',
      size: 2,
      createdAt: '2027-01-01T00:00:01Z',
    })
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b))
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a))
    expect(readAttachments(a).map((x) => x.name)).toEqual(['bilet.pdf', 'paragon.jpg'])
    expect(readAttachments(b)).toEqual(readAttachments(a))
    detachFile(a, '1')
    expect(readAttachments(a)).toHaveLength(1)
  })

  it('rozmiar po polsku', () => {
    expect(formatSize(512)).toBe('512 B')
    expect(formatSize(2048)).toBe('2 KB')
    expect(formatSize(3.5 * 1024 * 1024)).toBe('3,5 MB')
  })
})

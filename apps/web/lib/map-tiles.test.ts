import { describe, expect, it } from 'vitest'
import { tilesForPlaces } from './map-tiles'

const lisbon = { lat: 38.711, lng: -9.131 }
const sintra = { lat: 38.797, lng: -9.39 }

describe('kafelki mapy offline', () => {
  it('jedno miejsce: rozsądna liczba kafelków, wszystkie zoomy, bez powtórzeń', () => {
    const tiles = tilesForPlaces([lisbon])
    const keys = new Set(tiles.map((t) => `${t.z}/${t.x}/${t.y}`))
    expect(keys.size).toBe(tiles.length)
    expect(new Set(tiles.map((t) => t.z))).toEqual(new Set(Array.from({ length: 15 }, (_, z) => z)))
    expect(tiles.length).toBeLessThan(1000)
    // Kafelek z14 z Lizboną jest w zestawie.
    expect(tiles.some((t) => t.z === 14 && t.x === 7776 && t.y === 6278)).toBe(true)
  })

  it('dwa miasta: szczegóły tylko wokół miejsc, nie na całym obszarze', () => {
    const both = tilesForPlaces([lisbon, sintra])
    const z14 = both.filter((t) => t.z === 14).length
    // Prostokąt Lizbona–Sintra na z14 to kilkaset kolumn × wierszy; wokół dwóch miejsc dużo mniej.
    expect(z14).toBeLessThan(1000)
    expect(tilesForPlaces([])).toEqual([])
  })

  it('odległe miejsce (lotnisko w Warszawie) nie ściąga całej Europy', () => {
    const warsaw = { lat: 52.165, lng: 20.967 }
    const places = [lisbon, sintra, { lat: 38.72, lng: -9.14 }, warsaw]
    const tiles = tilesForPlaces(places)
    expect(tiles.length).toBeLessThan(1500)
    expect(tilesForPlaces([lisbon, sintra]).length).toBeLessThan(tiles.length)
  })
})

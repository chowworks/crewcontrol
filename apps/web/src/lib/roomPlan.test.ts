import type { BedType, PlanSpot, RoomPlanLayout } from '@cc/types'
import { describe, expect, it } from 'vitest'
import {
  moveSection,
  notPlaced,
  place,
  removeSection,
  removeTile,
  resizeSection,
  setPlaces,
  fitPlaces,
  sectionColumns,
  setTile,
  unplace,
  type Person,
} from './roomPlan'

const kendra: Person = {
  key: 'g:g1',
  name: 'Kendra W.',
  kind: 'accepted',
  guestId: 'g1',
  interestId: null,
}
const jordan: Person = {
  key: 'g:g2',
  name: 'Jordan P.',
  kind: 'pending',
  guestId: 'g2',
  interestId: null,
}
const main = { id: 'main', name: 'Main floor', beside: false, cols: 43, rows: 20 }
const tile = { id: 't1', sectionId: 'main', roomId: 'r1', landmark: null, x: 0, y: 0, w: 12, h: 12 }
const base: RoomPlanLayout = {
  sections: [main],
  tiles: [tile],
  spots: [{ roomId: 'r1', index: 0, name: 'Kendra W.', guestId: 'g1', interestId: null }],
  waiting: ['Cousin Mo'],
}

describe('place', () => {
  it('swaps two people on beds', () => {
    const start = place(base, jordan, 'panel', { roomId: 'r1', index: 1 })
    const out = place(start, kendra, { roomId: 'r1', index: 0 }, { roomId: 'r1', index: 1 })
    const at = (i: number) => out.spots.find((s) => s.index === i)?.guestId
    expect([at(0), at(1)]).toEqual(['g2', 'g1'])
  })

  it('sends whoever was there back to the side panel, a typed name to the waiting names', () => {
    const typed = place(
      base,
      { key: 'w:0', name: 'Cousin Mo', kind: 'typed', guestId: null, interestId: null },
      { waiting: 0 },
      { roomId: 'r1', index: 1 }
    )
    expect(typed.waiting).toEqual([])
    const out = place(typed, jordan, 'panel', { roomId: 'r1', index: 1 })
    expect(out.waiting).toEqual(['Cousin Mo'])
    expect(out.spots.map((s) => s.guestId)).toEqual(['g1', 'g2'])
  })

  it('keeps someone from the trip on one place only', () => {
    const out = place(base, kendra, 'panel', { roomId: 'r2', index: 0 })
    expect(out.spots).toEqual([
      { roomId: 'r2', index: 0, name: 'Kendra W.', guestId: 'g1', interestId: null },
    ])
  })
})

describe('the side panel', () => {
  it('lists the trip’s people not on a bed, then the waiting names', () => {
    expect(notPlaced(base, [kendra, jordan]).map((p) => p.name)).toEqual(['Jordan P.', 'Cousin Mo'])
  })

  it('takes a typed name off its bed back to the waiting names', () => {
    const typed = {
      ...base,
      spots: [{ roomId: 'r1', index: 0, name: 'Aunt Dee', guestId: null, interestId: null }],
    }
    expect(unplace(typed, 'r1', 0).waiting).toEqual(['Cousin Mo', 'Aunt Dee'])
  })

  it('gives back everyone on a room taken off the plan', () => {
    const out = removeTile(base, 't1')
    expect(out.tiles).toEqual([])
    expect(out.spots).toEqual([])
  })
})

describe('places added to a room', () => {
  const room = { id: 'r1', capacity: 2, bedTypes: [] }

  it('adds a place past what the room sleeps, and takes back only an empty last one', () => {
    const three = setPlaces(base, room, 3)
    expect(three.tiles[0].places).toBe(3)
    const used = {
      ...three,
      spots: [...three.spots, { ...three.spots[0], index: 2, guestId: 'g2' }],
    }
    expect(setPlaces(used, room, 2)).toBe(used)
    expect(setPlaces(three, room, 2).tiles[0]).toEqual(tile)
  })

  it('never goes under what the room sleeps or past 20', () => {
    expect(setPlaces(base, room, 1).tiles[0]).toEqual(tile)
    expect(setPlaces(base, room, 30).tiles[0].places).toBe(20)
  })

  it('makes a room sleep one more when someone more is put on a free bed', () => {
    const daybeds = { id: 'r1', capacity: 2, bedTypes: ['queen', 'daybed', 'daybed'] as BedType[] }
    const two = { ...base, spots: [] as PlanSpot[] }
    const spot = (index: number, guestId: string) => ({
      roomId: 'r1',
      index,
      name: guestId,
      guestId,
      interestId: null,
    })
    const one = fitPlaces({ ...two, spots: [spot(0, 'a'), spot(2, 'b')] }, daybeds)
    expect(one.tiles[0].places).toBeUndefined()
    const three = fitPlaces({ ...two, spots: [spot(0, 'a'), spot(1, 'b'), spot(3, 'c')] }, daybeds)
    expect(three.tiles[0].places).toBe(3)
    expect(setPlaces(three, daybeds, 2)).toBe(three)
  })
})

describe('tiles and parts of the house', () => {
  it('keeps a tile inside the plan and grows its part of the house', () => {
    const out = setTile(base, { ...tile, x: -3, y: 30 })
    expect(out.tiles[0]).toMatchObject({ x: 0, y: 30 })
    expect(out.sections[0].rows).toBe(43)
  })

  const cols = (l: RoomPlanLayout) => sectionColumns(l.sections).map((c) => c.map((s) => s.id))

  it('puts a part of the house beside another, and the one under it leads its column when it moves', () => {
    const up = { id: 'up', name: 'Upstairs', beside: false, cols: 20, rows: 10 }
    const loft = { id: 'loft', name: 'Loft', beside: true, cols: 20, rows: 10 }
    const layout = { ...base, sections: [main, up, loft] }
    expect(cols(layout)).toEqual([['main', 'up'], ['loft']])
    expect(cols(moveSection(layout, 'up', 'loft', 'below'))).toEqual([['main'], ['loft', 'up']])
    expect(cols(moveSection(layout, 'main', 'loft', 'below'))).toEqual([['up'], ['loft', 'main']])
  })

  it('lays out one part on the left and two stacked on the right', () => {
    const east = { ...main, id: 'east' }
    const floor2 = { id: 'f2', name: '2nd floor', beside: false, cols: 20, rows: 10 }
    const ground = { id: 'g', name: 'Main floor', beside: true, cols: 20, rows: 10 }
    const layout = { ...base, sections: [east, ground, floor2] }
    const step = moveSection(layout, 'f2', 'east', 'beside')
    expect(cols(step)).toEqual([['east'], ['f2'], ['g']])
    expect(cols(moveSection(step, 'g', 'f2', 'below'))).toEqual([['east'], ['f2', 'g']])
  })

  it('shrinks a part of the house by its edge, but never into a room on it', () => {
    const out = resizeSection(base, 'main', 5, 3)
    expect(out.sections[0]).toMatchObject({ cols: 12, rows: 12 })
    const empty = resizeSection({ ...base, tiles: [] }, 'main', 1, 200)
    expect(empty.sections[0]).toMatchObject({ cols: 4, rows: 80 })
  })

  it('never grows a part past the tallest plan the server takes', () => {
    const out = setTile(base, { ...tile, y: 200 })
    expect(out.sections[0].rows).toBe(80)
  })

  it('removes a part of the house with its rooms, and the first part never sits beside', () => {
    const up = { id: 'up', name: 'Upstairs', beside: true, cols: 20, rows: 10 }
    const out = removeSection({ ...base, sections: [main, up] }, 'main')
    expect(out.sections).toEqual([{ ...up, beside: false }])
    expect(out.tiles).toEqual([])
  })
})

import type { RoomPlanLayout } from '@cc/types'
import { describe, expect, it } from 'vitest'
import {
  moveSection,
  notPlaced,
  place,
  removeSection,
  removeTile,
  sectionRows,
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

describe('tiles and parts of the house', () => {
  it('keeps a tile inside the plan and grows its part of the house', () => {
    const out = setTile(base, { ...tile, x: -3, y: 30 })
    expect(out.tiles[0]).toMatchObject({ x: 0, y: 30 })
    expect(out.sections[0].rows).toBe(43)
  })

  it('puts a part of the house beside another, and the next one starts the row when it moves', () => {
    const up = { id: 'up', name: 'Upstairs', beside: false, cols: 20, rows: 10 }
    const loft = { id: 'loft', name: 'Loft', beside: true, cols: 20, rows: 10 }
    const layout = { ...base, sections: [main, up, loft] }
    expect(
      sectionRows(moveSection(layout, 'up', 'main', 'beside').sections).map((r) =>
        r.map((s) => s.id)
      )
    ).toEqual([['main', 'up'], ['loft']])
    expect(
      sectionRows(moveSection(layout, 'up', 'loft', 'below').sections).map((r) =>
        r.map((s) => s.id)
      )
    ).toEqual([['main'], ['loft'], ['up']])
  })

  it('puts a part below a whole row, keeping the parts beside the target together', () => {
    const up = { id: 'up', name: 'Upstairs', beside: true, cols: 20, rows: 10 }
    const loft = { id: 'loft', name: 'Loft', beside: false, cols: 20, rows: 10 }
    const layout = { ...base, sections: [main, up, loft] }
    expect(
      sectionRows(moveSection(layout, 'loft', 'main', 'below').sections).map((r) =>
        r.map((s) => s.id)
      )
    ).toEqual([['main', 'up'], ['loft']])
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

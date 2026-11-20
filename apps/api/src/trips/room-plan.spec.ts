import { BadRequestException } from '@nestjs/common'
import { parseApplyRoomPlan, parseRoomPlanLayout } from './room-plan-input'
import { clean, starter } from './room-plan.service'
import { roomSpots } from './trip-types'

const main = { id: 'main', name: 'Main floor', beside: false, cols: 43, rows: 20 }
const suite = {
  id: 't1',
  sectionId: 'main',
  roomId: 'r1',
  landmark: null,
  x: 0,
  y: 0,
  w: 12,
  h: 12,
}
const bath = {
  id: 't2',
  sectionId: 'main',
  roomId: null,
  landmark: { kind: 'bath' as const, label: 'Hall bath' },
  x: 13,
  y: 0,
  w: 6,
  h: 6,
}
const kendra = { roomId: 'r1', index: 0, name: 'Kendra W.', guestId: 'g1', interestId: null }
const layout = { sections: [main], tiles: [suite, bath], spots: [kendra], waiting: ['Kendra’s +1'] }

describe('roomSpots', () => {
  it('gives each bed its places, a bunk top first, and never more than the room sleeps', () => {
    expect(roomSpots({ bedTypes: ['king', 'bunk'], capacity: 3 })).toEqual([
      { index: 0, bed: 0, slot: 0 },
      { index: 1, bed: 0, slot: 1 },
      { index: 2, bed: 1, slot: 0 },
    ])
  })

  it('adds plain places for what the beds don’t cover', () => {
    expect(roomSpots({ bedTypes: ['twin'], capacity: 2 })).toEqual([
      { index: 0, bed: 0, slot: 0 },
      { index: 1, bed: null, slot: 0 },
    ])
  })
})

describe('parseRoomPlanLayout', () => {
  it('accepts a plan', () => {
    expect(parseRoomPlanLayout(layout)).toEqual(layout)
  })

  it.each([
    [{ ...layout, sections: [] }, 'A plan has at least one part of the house'],
    [
      { ...layout, sections: [{ ...main, beside: true }] },
      'The first part of the house can’t sit beside another',
    ],
    [{ ...layout, tiles: [{ ...suite, x: 40 }] }, 'x must be a whole number from 0 to 31'],
    [
      { ...layout, tiles: [{ ...suite, sectionId: 'attic' }] },
      'A tile is on a part of the house that isn’t there',
    ],
    [{ ...layout, tiles: [{ ...bath, roomId: 'r1' }] }, 'A tile is either a room or a landmark'],
    [{ ...layout, tiles: [suite, { ...suite, id: 't3' }] }, 'A room is on the plan twice'],
    [{ ...layout, spots: [kendra, { ...kendra, index: 1 }] }, 'Someone is on the plan twice'],
    [
      { ...layout, spots: [kendra, { ...kendra, guestId: null }] },
      'Two people are on the same place',
    ],
    [
      { ...layout, sections: [{ ...main, cols: 200 }] },
      'cols must be a whole number from 4 to 130',
    ],
  ])('refuses a bad plan (%#)', (bad, message) => {
    expect(() => parseRoomPlanLayout(bad)).toThrow(new BadRequestException(message))
  })

  it('reads Apply’s email box', () => {
    expect(parseApplyRoomPlan({ email: true })).toEqual({ email: true })
    expect(() => parseApplyRoomPlan({})).toThrow(BadRequestException)
  })
})

const rooms = [
  { id: 'r1', name: 'Primary suite', capacity: 2, bedTypes: ['king'] },
  { id: 'r2', name: 'Bunk room', capacity: 4, bedTypes: ['bunk', 'bunk'] },
]
const guests = new Map([
  ['g1', { id: 'g1', firstName: 'Kendra', lastName: 'Wells', roomId: 'r1' }],
  ['g2', { id: 'g2', firstName: 'Jordan', lastName: 'Price', roomId: 'r2' }],
  ['g3', { id: 'g3', firstName: 'Avery', lastName: 'Lane', roomId: null }],
])

describe('starter', () => {
  it('puts every room on one part of the house and each guest in the room they have', () => {
    const plan = starter({ rooms, guests, interest: new Set() })
    expect(plan.sections).toEqual([{ ...main, rows: 20 }])
    expect(plan.tiles.map((t) => [t.roomId, t.x, t.y])).toEqual([
      ['r1', 0, 0],
      ['r2', 11, 0],
    ])
    expect(plan.spots).toEqual([
      { roomId: 'r1', index: 0, name: 'Kendra W.', guestId: 'g1', interestId: null },
      { roomId: 'r2', index: 0, name: 'Jordan P.', guestId: 'g2', interestId: null },
    ])
  })
})

describe('clean', () => {
  it('drops a removed room’s tile and gives typed names on it back to the waiting list', () => {
    const saved = {
      ...layout,
      tiles: [suite, { ...suite, id: 't9', roomId: 'gone' }],
      spots: [
        kendra,
        { roomId: 'gone', index: 0, name: 'Cousin Mo', guestId: null, interestId: null },
      ],
    }
    const out = clean(saved, { rooms, guests, interest: new Set() })
    expect(out.tiles.map((t) => t.id)).toEqual(['t1'])
    expect(out.spots).toEqual([kendra])
    expect(out.waiting).toEqual(['Kendra’s +1', 'Cousin Mo'])
  })

  it('keeps the name of someone who left the trip, without the link', () => {
    const out = clean(layout, { rooms, guests: new Map(), interest: new Set() })
    expect(out.spots).toEqual([{ ...kendra, guestId: null }])
  })

  it('gives back a place the room no longer has', () => {
    const out = clean(
      { ...layout, spots: [{ ...kendra, index: 5, guestId: null }] },
      { rooms, guests, interest: new Set() }
    )
    expect(out.spots).toEqual([])
    expect(out.waiting).toContain('Kendra W.')
  })
})

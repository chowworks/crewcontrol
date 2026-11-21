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
  it('gives every bed its places, a bunk top first, even past what the room sleeps', () => {
    expect(roomSpots({ bedTypes: ['king', 'bunk'], capacity: 3 })).toEqual([
      { index: 0, bed: 0, slot: 0 },
      { index: 1, bed: 0, slot: 1 },
      { index: 2, bed: 1, slot: 0 },
      { index: 3, bed: 1, slot: 1 },
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

  it('keeps a landmark turned a quarter', () => {
    const turned = { ...bath, landmark: { ...bath.landmark, turn: 1 } }
    expect(parseRoomPlanLayout({ ...layout, tiles: [suite, turned] }).tiles[1]).toEqual(turned)
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
    [{ ...layout, tiles: [suite, { ...bath, places: 3 }] }, 'Only a room has places'],
    [
      { ...layout, tiles: [suite, { ...bath, landmark: { ...bath.landmark, turn: 4 } }] },
      'turn must be a whole number from 1 to 3',
    ],
    [
      { ...layout, tiles: [{ ...suite, places: 21 }, bath] },
      'places must be a whole number from 1 to 20',
    ],
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
    const draftAt = '2026-11-20T18:42:00.000Z'
    expect(parseApplyRoomPlan({ email: true, draftAt })).toEqual({ email: true, draftAt })
    expect(() => parseApplyRoomPlan({ email: true })).toThrow(BadRequestException)
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

describe('starter, shared rooms', () => {
  it('gives each guest their own bed before anyone shares', () => {
    const twoQueens = [{ id: 'r1', name: 'Twin queens', capacity: 2, bedTypes: ['queen', 'queen'] }]
    const pair = new Map([
      ['g1', { id: 'g1', firstName: 'Kendra', lastName: 'Wells', roomId: 'r1' }],
      ['g2', { id: 'g2', firstName: 'Jordan', lastName: 'Price', roomId: 'r1' }],
    ])
    const plan = starter({ rooms: twoQueens, guests: pair, interest: new Set() })
    expect(plan.spots.map((s) => s.index)).toEqual([0, 2])
  })
})

describe('starter, big houses', () => {
  it('leaves rooms that don’t fit one part of the house under Rooms to place', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      id: `r${i}`,
      name: `Room ${i}`,
      capacity: 2,
      bedTypes: ['queen', 'twin', 'twin', 'twin', 'twin', 'twin', 'twin'],
    }))
    const plan = starter({ rooms: many, guests: new Map(), interest: new Set() })
    expect(plan.tiles.length).toBeLessThan(30)
    expect(Math.max(...plan.tiles.map((t) => t.y + t.h))).toBeLessThanOrEqual(80)
    expect(plan.sections[0].rows).toBeLessThanOrEqual(80)
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

  it('gives an interested person who signed up their bed as that guest', () => {
    const out = clean(
      {
        ...layout,
        spots: [{ roomId: 'r1', index: 0, name: 'Avery', guestId: null, interestId: 'i1' }],
      },
      { rooms, guests, interest: new Set(), signedUp: new Map([['i1', 'g3']]) }
    )
    expect(out.spots).toEqual([
      { roomId: 'r1', index: 0, name: 'Avery L.', guestId: 'g3', interestId: null },
    ])
  })

  it('keeps a person on a place the organizer added to the room', () => {
    const extra = { ...kendra, index: 2, guestId: null, name: 'Cousin Mo' }
    const out = clean(
      { ...layout, tiles: [{ ...suite, places: 3 }, bath], spots: [kendra, extra] },
      { rooms, guests, interest: new Set() }
    )
    expect(out.spots).toEqual([kendra, extra])
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

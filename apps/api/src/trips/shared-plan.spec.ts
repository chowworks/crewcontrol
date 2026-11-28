import { guestPlan, sharedCopy, publicPlan } from './shared-plan'
import type { RoomPlanLayout } from './trip-types'

const layout: RoomPlanLayout = {
  sections: [{ id: 'main', name: 'Main floor', beside: false, cols: 40, rows: 20 }],
  tiles: [
    {
      id: 't1',
      sectionId: 'main',
      roomId: 'r1',
      landmark: null,
      x: 0,
      y: 0,
      w: 10,
      h: 12,
      places: 3,
    },
    {
      id: 't2',
      sectionId: 'main',
      roomId: null,
      landmark: { kind: 'kitchen', label: 'Kitchen' },
      x: 11,
      y: 0,
      w: 6,
      h: 4,
    },
  ],
  spots: [
    { roomId: 'r1', index: 0, name: 'Kendra W.', guestId: 'g1', interestId: null },
    { roomId: 'r1', index: 1, name: 'Kendra’s +1', guestId: null, interestId: null },
    { roomId: 'r1', index: 2, name: 'Devon E.', guestId: null, interestId: 'i1' },
  ],
  waiting: ['Aunt Dee'],
}
const rooms = [
  { id: 'r1', name: 'Primary suite', capacity: 2, bedTypes: ['king'] },
  { id: 'r2', name: 'Den', capacity: 2, bedTypes: ['sofa-bed'] },
]

describe('the floor plan shared with guests', () => {
  const copy = sharedCopy(layout, rooms)

  it('keeps no typed name, no Interested person and no waiting name', () => {
    const text = JSON.stringify(copy)
    for (const hidden of ['Kendra’s +1', 'Devon E.', 'i1', 'Aunt Dee', 'Kendra W.'])
      expect(text).not.toContain(hidden)
    expect(copy.rooms.map((r) => r.id)).toEqual(['r1'])
    expect(copy.tiles[0].places).toBe(3)
  })

  it('names accepted guests only, marks the reader, and shows everyone else as taken', () => {
    const plan = guestPlan(
      copy,
      new Date('2026-11-21T22:00:00Z'),
      [{ id: 'g1', firstName: 'Kendra', lastName: 'Wells' }],
      ['g1']
    )
    const places = plan.tiles[0].room!.places
    expect(places.map((p) => [p.name, p.taken, p.you])).toEqual([
      ['Kendra W.', true, true],
      [null, true, false],
      [null, true, false],
    ])
    expect(plan.tiles[1]).toMatchObject({ room: null, landmark: { kind: 'kitchen' } })
  })

  it('shows a guest who is no longer accepted as taken, without a name', () => {
    const plan = guestPlan(copy, new Date(), [], [])
    expect(plan.tiles[0].room!.places[0]).toMatchObject({ name: null, taken: true, you: false })
  })
})

describe('the floor plan on the public trip page', () => {
  it('keeps the rooms and beds but nobody on them: every place the same, no names', () => {
    const plan = publicPlan(
      {
        sections: [{ id: 's1', name: 'Main floor', cols: 8, rows: 6 }],
        tiles: [{ id: 't1', sectionId: 's1', roomId: 'r1', x: 0, y: 0, w: 4, h: 3, places: 2 }],
        rooms: [{ id: 'r1', name: 'King suite', bedTypes: ['king'] }],
      } as Parameters<typeof publicPlan>[0],
      new Date('2026-11-28T00:00:00Z')
    )
    const places = plan.tiles[0].room!.places
    expect(plan.tiles[0].room!.name).toBe('King suite')
    expect(places).toHaveLength(2)
    expect(places.every((p) => p.name === null && !p.taken && !p.you)).toBe(true)
  })
})

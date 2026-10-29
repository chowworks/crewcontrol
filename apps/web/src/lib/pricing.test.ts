import { describe, expect, it } from 'vitest'
import { priceRooms, spreadDates, type PricingRoom } from './pricing'

// A made-up house: total $22,611.34, of which $2,150 is shared fees.
const rooms: PricingRoom[] = [
  { name: 'Primary', occupants: 2, weight: 1.75 },
  { name: 'Queen', occupants: 2, weight: 1.375 },
  { name: 'Twins', occupants: 2, weight: 1.125 },
  { name: 'Bonus', occupants: 6, weight: 1 },
]
const base = { rentCents: 2_046_134, feesCents: 215_000, coverCents: 0, rooms }
const dollars = (r: ReturnType<typeof priceRooms>) =>
  r.rooms.map((x) => Math.round(x.perPersonCents / 100))

describe('priceRooms', () => {
  it('splits flat', () => {
    expect(dollars(priceRooms({ ...base, method: 'flat' }))).toEqual([1884, 1884, 1884, 1884])
  })

  it('weights the whole cost by room when tiered', () => {
    expect(dollars(priceRooms({ ...base, method: 'tiered' }))).toEqual([2729, 2144, 1754, 1559])
  })

  it('splits fees equally and weights only the rent when hybrid', () => {
    expect(dollars(priceRooms({ ...base, method: 'hybrid' }))).toEqual([2649, 2119, 1767, 1590])
  })

  it('takes what the organizer covers off the rent first', () => {
    const r = priceRooms({ ...base, coverCents: 261_134, method: 'flat' })
    expect(r.costCents).toBe(2_000_000)
    expect(r.rooms[0].perPersonCents).toBe(166_667)
  })

  it('charges someone alone in a room for two for both places', () => {
    const r = priceRooms({
      ...base,
      method: 'flat',
      rooms: [
        { name: 'King', occupants: 1, weight: 1, minPeople: 2 },
        { name: 'Twins', occupants: 2, weight: 1 },
      ],
      rentCents: 300_000,
      feesCents: 0,
    })
    expect(r.rooms.map((x) => x.perPersonCents)).toEqual([150_000, 75_000])
    expect(r.collectedCents).toBe(300_000)
  })

  it('treats an emptied or zero weight as 1, never $NaN', () => {
    const r = priceRooms({
      ...base,
      method: 'tiered',
      rooms: [{ name: 'Only', occupants: 2, weight: 0 }],
      rentCents: 100_000,
      feesCents: 0,
    })
    expect(r.rooms[0].perPersonCents).toBe(50_000)
  })

  it('counts only rooms with people in them', () => {
    const r = priceRooms({
      ...base,
      method: 'flat',
      rooms: rooms.map((x, i) => ({ ...x, occupants: i === 3 ? 2 : x.occupants })),
    })
    expect(r.people).toBe(8)
    expect(dollars(r)[0]).toBe(2826)
  })
})

describe('spreadDates', () => {
  it('keeps the same day of the month when the months divide evenly', () =>
    expect(spreadDates('2026-11-01', '2027-05-01', 4)).toEqual([
      '2026-11-01',
      '2027-01-01',
      '2027-03-01',
      '2027-05-01',
    ]))

  it('clamps to the end of a shorter month', () =>
    expect(spreadDates('2027-01-31', '2027-03-31', 3)).toEqual([
      '2027-01-31',
      '2027-02-28',
      '2027-03-31',
    ]))

  it('otherwise spaces by days', () =>
    expect(spreadDates('2027-01-01', '2027-01-20', 3)).toEqual([
      '2027-01-01',
      '2027-01-11',
      '2027-01-20',
    ]))

  it('gives one date for one payment', () =>
    expect(spreadDates('2027-01-01', '2027-02-01', 1)).toEqual(['2027-01-01']))
})

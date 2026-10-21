import { describe, expect, it } from 'vitest'
import { addMonths, paymentSchedule, priceRooms, type PricingRoom } from './pricing'

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

describe('paymentSchedule', () => {
  it('takes the deposit first, then splits the rest, with rounding on the last', () => {
    expect(
      paymentSchedule({
        perPersonCents: 188_400,
        installments: 4,
        firstDue: '2026-11-01',
        depositCents: 30_000,
      })
    ).toEqual([
      { date: '2026-11-01', amountCents: 30_000 },
      { date: '2026-12-01', amountCents: 52_800 },
      { date: '2027-01-01', amountCents: 52_800 },
      { date: '2027-02-01', amountCents: 52_800 },
    ])
  })

  it('splits evenly with no deposit and adds up exactly', () => {
    const s = paymentSchedule({
      perPersonCents: 100_001,
      installments: 3,
      firstDue: '2027-01-31',
      depositCents: 0,
    })
    expect(s.map((x) => x.amountCents)).toEqual([33_333, 33_333, 33_335])
    expect(s.map((x) => x.date)).toEqual(['2027-01-31', '2027-02-28', '2027-03-31'])
  })
})

describe('addMonths', () => {
  it('crosses years', () => expect(addMonths('2026-12-15', 2)).toBe('2027-02-15'))
})

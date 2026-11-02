import { describe, expect, it } from 'vitest'
import { paymentPlan } from '@cc/types'
import { evenRoomPrice, evenSplit, fullRooms, spreadDates } from './pricing'

describe('evenSplit', () => {
  it('takes the organizer’s part off the top and splits the rest', () => {
    expect(evenSplit(175_000, 50_000, 5)).toBe(25_000)
  })

  it('rounds up to the dollar, so the organizer is never short', () => {
    expect(evenSplit(100_000, 0, 3)).toBe(33_400)
  })

  it('is zero with nothing left to split or nobody to split it', () => {
    expect(evenSplit(50_000, 50_000, 5)).toBe(0)
    expect(evenSplit(50_000, 0, 0)).toBe(0)
  })
})

describe('price by room', () => {
  const rooms = [
    { capacity: 2, priceCents: 30_000 },
    { capacity: 2, priceCents: 25_000 },
    { capacity: 3, priceCents: 20_000 },
  ]

  it('collects every place in every room at its price', () => {
    expect(fullRooms(rooms)).toBe(170_000)
  })

  it('starts from an even split over every place', () => {
    expect(evenRoomPrice(175_000, rooms)).toBe(25_000)
    expect(evenRoomPrice(100_000, rooms)).toBe(14_300)
    expect(evenRoomPrice(100_000, [])).toBe(0)
  })
})

describe('a custom payment plan', () => {
  const amounts = (plan: { amountCents: number }[]) => plan.map((p) => p.amountCents)

  it('uses dollar shares that add up to the price as they are', () => {
    expect(amounts(paymentPlan(100_000, 3, null, [], [10_000, 50_000, 40_000]))).toEqual([
      10_000, 50_000, 40_000,
    ])
  })

  it('splits a room’s own price by percentage, whole dollars, the rest last', () => {
    expect(amounts(paymentPlan(193_400, 3, null, [], [2000, 5000, 3000]))).toEqual([
      38_600, 96_700, 58_100,
    ])
  })

  it('falls back to an even split when the shares don’t fit the plan', () => {
    expect(amounts(paymentPlan(90_000, 3, null, [], [1, 2]))).toEqual([30_000, 30_000, 30_000])
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

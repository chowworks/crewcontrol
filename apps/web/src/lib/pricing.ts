// Price-per-person and payment-date math for the Trip Control panel simulator. Money is integer cents.

export type PricingMethod = 'flat' | 'tiered' | 'hybrid'

export const PRICING_METHODS: { value: PricingMethod; label: string; hint: string }[] = [
  { value: 'flat', label: 'Flat', hint: 'Everyone pays the same.' },
  {
    value: 'tiered',
    label: 'Tiered by room',
    hint: 'The whole cost is split by room weight.',
  },
  {
    value: 'hybrid',
    label: 'Hybrid',
    hint: 'Shared fees split equally; room weights apply to the rent only.',
  },
]

export interface PricingRoom {
  name: string
  occupants: number
  weight: number
  /** The fewest people the room is priced for; fewer than this pay for the empty places too. Default 1. */
  minPeople?: number
}

/** Places a room is paid for: its people, but never fewer than its minimum once anyone is in it. */
export const paidPlaces = (r: PricingRoom) =>
  r.occupants > 0 ? Math.max(r.occupants, r.minPeople ?? 1) : 0

export interface PricingInput {
  rentCents: number
  /** Deposit, cleaning, booking and other shared fees. */
  feesCents: number
  /** What the organizer chooses to pay themselves; it comes off the rent first, then the fees. */
  coverCents: number
  method: PricingMethod
  rooms: PricingRoom[]
}

export interface RoomPrice {
  name: string
  occupants: number
  perPersonCents: number
}

export interface PricingResult {
  rooms: RoomPrice[]
  people: number
  /** What the crew pays in all, after the organizer's share. */
  costCents: number
  collectedCents: number
}

/** A weight that isn't a positive number (an emptied box) counts as the baseline, 1. */
const weightOf = (r: PricingRoom) => (Number.isFinite(r.weight) && r.weight > 0 ? r.weight : 1)

/** Prices every room, in order. Empty rooms get a price too, but only people count toward the totals. */
export function priceRooms(input: PricingInput): PricingResult {
  const rooms = input.rooms.map((r) => ({ ...r, weight: weightOf(r) }))
  const people = rooms.reduce((n, r) => n + r.occupants, 0)
  const rent = Math.max(0, input.rentCents - input.coverCents)
  const fees = Math.max(0, input.feesCents - Math.max(0, input.coverCents - input.rentCents))
  const costCents = rent + fees
  if (people === 0) return { rooms: [], people, costCents, collectedCents: 0 }

  // Each room pays for its places; a room under its minimum spreads the empty places over who's in it.
  const places = rooms.reduce((n, r) => n + paidPlaces(r), 0)
  const weightTotal = rooms.reduce((n, r) => n + paidPlaces(r) * r.weight, 0)
  const priced = rooms.map((r) => {
    const share = r.occupants > 0 ? paidPlaces(r) / r.occupants : 1
    let per: number
    if (input.method === 'flat') per = (costCents / places) * share
    else if (input.method === 'tiered') per = ((costCents * r.weight) / weightTotal) * share
    else per = (fees / places + (rent * r.weight) / weightTotal) * share
    return { name: r.name, occupants: r.occupants, perPersonCents: Math.round(per) }
  })
  const collectedCents = priced.reduce((n, r) => n + r.perPersonCents * r.occupants, 0)
  return { rooms: priced, people, costCents, collectedCents }
}

/**
 * `n` due dates from `first` to `last`, spaced evenly (issue #12). When the two fall on the same day of the month and
 * the months divide evenly, the dates do too ("the 1st of every other month"); otherwise they're spaced by days.
 */
export function spreadDates(first: string, last: string, n: number): string[] {
  const count = Math.max(1, Math.floor(n))
  if (count === 1) return [first]
  const [y1, m1, d1] = first.split('-').map(Number)
  const [y2, m2, d2] = last.split('-').map(Number)
  const months = (y2 - y1) * 12 + (m2 - m1)
  if (d1 === d2 && months > 0 && months % (count - 1) === 0)
    return Array.from({ length: count }, (_, i) => addMonths(first, (months / (count - 1)) * i))
  const start = Date.parse(`${first}T00:00:00Z`)
  const span = Date.parse(`${last}T00:00:00Z`) - start
  return Array.from({ length: count }, (_, i) =>
    new Date(start + Math.round((span * i) / (count - 1) / 86_400_000) * 86_400_000)
      .toISOString()
      .slice(0, 10)
  )
}

/** 'YYYY-MM-DD' plus whole months, clamped to the end of a shorter month. */
function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const total = y * 12 + (m - 1) + months
  const year = Math.floor(total / 12)
  const month = (total % 12) + 1
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const day = Math.min(d, last)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

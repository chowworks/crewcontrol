import {
  guestActions,
  tripActionCount,
  type Guest,
  type OrganizerTrip,
  type Payment,
} from './trip-types'

// What needs the organizer (Trip Control's Actions and the red counts), from the shared rules.
const at = '2026-10-20T15:00:00.000Z'
const terms = {
  priceCents: 1000,
  installmentCount: 2,
  startDate: 's',
  endDate: 'e',
  refundTerms: 'r',
  firstInstallmentCents: 500,
  paidCents: 0,
  pendingCents: 0,
  balanceCents: 1000,
}
const pay = (id: string, status: Payment['status'], amount = 500): Payment => ({
  id,
  guestPaymentAmount: amount,
  receivedPaymentAmount: status === 'confirmed' ? amount : null,
  method: 'Zelle',
  methodKind: 'zelle',
  sentOn: '2026-10-20',
  note: '',
  status,
  loggedBy: 'guest',
  reportedAt: at,
  decidedAt: null,
})
const guest = (id: string, extra: Partial<Guest> = {}): Guest => ({
  id,
  firstName: id,
  lastName: 'X',
  email: `${id}@example.com`,
  phone: '555',
  status: 'interested',
  createdAt: at,
  spotPaidAt: null,
  refundSentAt: null,
  waitlistedAt: null,
  offeredAt: null,
  payments: [],
  roomId: null,
  roomNote: '',
  signedAt: at,
  terms,
  ...extra,
})
const trip = (guests: Guest[], extra: Partial<OrganizerTrip> = {}) =>
  ({
    joinMode: 'pay_first',
    maxGuests: null,
    waitlistBufferPercent: 10,
    guests,
    ...extra,
  }) as OrganizerTrip

describe('what needs the organizer', () => {
  it('lists each reported payment, marking a short one, and a guest ready to accept', () => {
    const g = guest('a', { payments: [pay('p1', 'reported', 200)] })
    expect(guestActions(g, trip([g]))).toEqual([
      expect.objectContaining({ kind: 'payment', short: true, due: 500 }),
    ])
    const ready = guest('b', { payments: [pay('p2', 'confirmed')], spotPaidAt: at })
    expect(guestActions(ready, trip([ready])).map((a) => a.kind)).toEqual(['accept'])
  })

  it('offers the spot to the next on the waitlist only once one opens', () => {
    const inLine = guest('in', { payments: [pay('p3', 'reported')] })
    const next = guest('next', { waitlistedAt: at })
    const after = guest('after', { waitlistedAt: '2026-10-21T00:00:00.000Z' })
    // One spot, one guest in line who can pay (1 + 10% rounded up = 2): open.
    const open = trip([inLine, next, after], { maxGuests: 1 })
    expect(guestActions(next, open).map((a) => a.kind)).toEqual(['offer'])
    expect(guestActions(after, open)).toEqual([])
    // Two in line who can pay: full for paying, so nobody is offered a spot.
    const busy = trip([inLine, guest('in2'), next], { maxGuests: 1 })
    expect(guestActions(next, busy)).toEqual([])
  })

  it('counts every action on the trip', () => {
    const t = trip([
      guest('a', { payments: [pay('p1', 'reported'), pay('p2', 'reported', 100)] }),
      guest('b', { status: 'declined', payments: [pay('p3', 'reported')] }),
    ])
    expect(tripActionCount(t)).toBe(2)
  })
})

import {
  guestActions,
  tripActionCount,
  waitlistSpotOpen,
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
  adjustmentCents: 0,
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
  paidByName: '',
  transferId: null,
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
  adjustments: [],
  roomId: null,
  roomNote: '',
  signedAt: at,
  terms,
  hasAccount: true,
  managedBy: null,
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

  it('gives the waitlist one action for the trip once a spot opens, and none to anyone on it', () => {
    const inLine = guest('in', { payments: [pay('p3', 'reported')] })
    const first = guest('first', { waitlistedAt: at })
    const later = guest('later', { waitlistedAt: '2026-10-21T00:00:00.000Z' })
    // Two spots, one guest in line who can pay: one is open.
    const open = trip([inLine, first, later], { maxGuests: 2 })
    expect(waitlistSpotOpen(open)).toBe(true)
    expect(guestActions(first, open)).toEqual([])
    expect(guestActions(later, open)).toEqual([])
    // The reported payment, plus the open spot.
    expect(tripActionCount(open)).toBe(2)
    // One spot and one guest who can pay for it: no spot to give, though the buffer still lets newcomers join.
    expect(waitlistSpotOpen(trip([inLine, first], { maxGuests: 1 }))).toBe(false)
    // Offering it is enough: the offered guest is in line for it.
    const offered = guest('first', { waitlistedAt: at, offeredAt: at })
    expect(waitlistSpotOpen(trip([offered, later], { maxGuests: 1 }))).toBe(false)
    // An accept-first trip: open while a spot isn't taken.
    const acceptFirst = { joinMode: 'accept_first' as const, maxGuests: 1 }
    expect(waitlistSpotOpen(trip([first], acceptFirst))).toBe(true)
    expect(waitlistSpotOpen(trip([guest('in', { status: 'approved' }), first], acceptFirst))).toBe(
      false
    )
    // Nobody waiting: nothing to do.
    expect(waitlistSpotOpen(trip([inLine], { maxGuests: 2 }))).toBe(false)
  })

  it('counts every action on the trip', () => {
    const t = trip([
      guest('a', { payments: [pay('p1', 'reported'), pay('p2', 'reported', 100)] }),
      guest('b', { status: 'declined', payments: [pay('p3', 'reported')] }),
    ])
    expect(tripActionCount(t)).toBe(2)
  })

  it('counts one transfer for several travelers once', () => {
    const shared = (id: string) => ({
      ...pay(id, 'reported'),
      transferId: 'tr1',
      paidByName: 'Dana R',
    })
    const t = trip([
      guest('a', { payments: [shared('p1')] }),
      guest('b', { payments: [shared('p2')] }),
    ])
    expect(guestActions(t.guests[0], t)[0].key).toBe('tr1')
    expect(tripActionCount(t)).toBe(1)
  })
})

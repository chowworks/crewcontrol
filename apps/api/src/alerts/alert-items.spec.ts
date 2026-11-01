import type { Guest, OrganizerTrip, Payment } from '../trips/trip-types'
import { alertItems, summary } from './alert-items'

// Which of Trip Control's Actions an organizer is emailed about, and how the email says it.
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
  schedule: [],
}
const pay = (id: string, transferId: string | null = null): Payment => ({
  id,
  guestPaymentAmount: 500,
  receivedPaymentAmount: null,
  method: 'Zelle',
  methodKind: 'zelle',
  sentOn: '2026-10-20',
  note: '',
  status: 'reported',
  loggedBy: 'guest',
  paidByName: '',
  transferId,
  reportedAt: at,
  decidedAt: null,
})
const guest = (id: string, extra: Partial<Guest> = {}): Guest => ({
  id,
  roomPriceDiffCents: 0,
  organizer: false,
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
  emailProblem: null,
  ...extra,
})
const trip = (guests: Guest[], extra: Partial<OrganizerTrip> = {}) =>
  ({
    id: 'T1',
    joinMode: 'accept_first',
    maxGuests: null,
    waitlistBufferPercent: 10,
    guests,
    receipts: { address: null, email: null, domain: null, on: false, unmatched: [] },
    questionsWaiting: 0,
    ...extra,
  }) as OrganizerTrip

describe('organizer alert items', () => {
  it('names guests to accept, payments, receipts and email problems, one per action', () => {
    const t = trip(
      [
        guest('a'),
        guest('b', { status: 'approved', payments: [pay('p1', 'tr1')] }),
        guest('c', { status: 'approved', payments: [pay('p2', 'tr1')] }),
        guest('d', { status: 'approved', emailProblem: 'bounced' }),
      ],
      {
        receipts: {
          address: null,
          email: null,
          domain: null,
          on: true,
          unmatched: [{ id: 'r1' }],
        } as unknown as OrganizerTrip['receipts'],
      }
    )
    expect(alertItems(t)).toEqual([
      { key: 'a-accept', kind: 'accept' },
      // One transfer for two travelers is one action.
      { key: 'tr1', kind: 'payment' },
      { key: 'd-email', kind: 'email' },
      { key: 'r1', kind: 'receipt' },
    ])
  })

  it('leaves out a room’s new price, which the organizer changed, and questions, which have their own email', () => {
    const t = trip([guest('a', { status: 'approved', roomPriceDiffCents: 5000 })], {
      questionsWaiting: 2,
    })
    expect(alertItems(t)).toEqual([])
  })

  it('names a spot that opened for the waitlist once, for the trip', () => {
    const t = trip([guest('w', { waitlistedAt: at })], { maxGuests: 4 })
    expect(alertItems(t)).toEqual([{ key: 'T1-spot', kind: 'spot' }])
  })

  it('says what’s new in one sentence, most pressing first', () => {
    expect(
      summary([
        { key: '1', kind: 'accept' },
        { key: '2', kind: 'payment' },
        { key: '3', kind: 'payment' },
      ])
    ).toBe('2 payments to confirm, 1 guest to accept.')
    expect(summary([{ key: 's', kind: 'spot' }])).toBe(
      '1 spot open to offer someone on the waitlist.'
    )
  })
})

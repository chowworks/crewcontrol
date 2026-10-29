import {
  NOT_A_PAYMENT,
  guestsNamed,
  placeReceipt,
  type PlaceGuest,
  type Sender,
} from './place-receipt'
import type { ReadReceipt } from './read-receipt'

const guest = (
  id: string,
  first: string,
  last: string,
  more: Partial<PlaceGuest> = {}
): PlaceGuest => ({
  id,
  firstName: first,
  lastName: last,
  status: 'approved',
  userId: `u-${first.toLowerCase()}`,
  managedByUserId: null,
  refundSentAt: null,
  waitlistedAt: null,
  offeredAt: null,
  payments: [],
  ...more,
})
const guests = [
  guest('k', 'Kendra', 'Smith'),
  guest('m', 'Marcus', 'Lee'),
  guest('j1', 'Jordan', 'Diaz', { userId: 'u-jd1' }),
  guest('j2', 'Jordan', 'Dean', { userId: 'u-jd2' }),
  guest('x', 'Tasha', 'Grant', { status: 'declined' }),
]
const read = (more: Partial<ReadReceipt> = {}): ReadReceipt => ({
  amountCents: 30000,
  payerName: '',
  payeeName: '',
  methodKind: 'zelle',
  sentOn: '2026-10-22',
  ...more,
})
// What a guest forwards: their own "You sent $300 to Chris Howard".
const sent = (more: Partial<ReadReceipt> = {}) => read({ payeeName: 'Chris Howard', ...more })
const organizer: Sender = {
  address: 'chris@example.com',
  verified: true,
  organizer: true,
  userId: 'u-chris',
}
const from = (address: string, more: Partial<Sender> = {}): Sender => ({
  address,
  verified: true,
  organizer: false,
  userId: null,
  ...more,
})
const marcus = from('marcus@example.com', { userId: 'u-marcus' })
const kendra = from('kendra@example.com', { userId: 'u-kendra' })

describe('placeReceipt', () => {
  it('files a guest’s own verified forward of money they sent on them', () => {
    expect(placeReceipt(sent(), marcus, guests)).toEqual({ kind: 'guest', guestId: 'm' })
  })

  it('never files money a guest received, or an amount with no direction, as their payment', () => {
    expect(placeReceipt(read({ payerName: 'Pat Doe' }), marcus, guests)).toEqual({
      kind: 'unmatched',
      reason: 'It looks like money they received, not a payment they sent.',
      suggestedGuestId: 'm',
    })
    expect(placeReceipt(read(), marcus, guests)).toMatchObject({
      kind: 'unmatched',
      reason: 'It doesn’t say who the money went to.',
    })
  })

  it('goes by a verified account, never the email a guest typed', () => {
    expect(placeReceipt(sent(), from('marcus@example.com'), guests)).toMatchObject({
      kind: 'unmatched',
      reason: 'It came from an address that isn’t on this trip.',
    })
  })

  it('files a verified forward from an address the organizer tied to a guest on that guest', () => {
    const work = from('kendra.work@example.net', { rememberedGuestId: 'k' })
    expect(placeReceipt(sent(), work, guests)).toEqual({ kind: 'guest', guestId: 'k' })
    expect(placeReceipt(sent(), { ...work, verified: false }, guests)).toMatchObject({
      kind: 'unmatched',
      reason: 'We couldn’t check that it really came from that address.',
      suggestedGuestId: 'k',
    })
  })

  it('files an organizer’s forward on the guest the email names', () => {
    expect(placeReceipt(read({ payerName: 'KENDRA SMITH' }), organizer, guests)).toEqual({
      kind: 'guest',
      guestId: 'k',
    })
  })

  it('goes by the name in an organizer’s forward even when they travel or look after someone', () => {
    const withOrganizer = [
      ...guests,
      guest('c', 'Chris', 'Howard', { userId: 'u-chris' }),
      guest('kid', 'Ava', 'Howard', { userId: null, managedByUserId: 'u-chris' }),
    ]
    expect(placeReceipt(read({ payerName: 'Kendra Smith' }), organizer, withOrganizer)).toEqual({
      kind: 'guest',
      guestId: 'k',
    })
  })

  it('leaves it for the organizer when the name is no guest, or could be several', () => {
    expect(placeReceipt(read({ payerName: 'Pat Doe' }), organizer, guests)).toMatchObject({
      kind: 'unmatched',
      reason: 'No guest on this trip is named Pat Doe.',
    })
    expect(placeReceipt(read({ payerName: 'Jordan D' }), organizer, guests)).toMatchObject({
      kind: 'unmatched',
      reason: 'More than one guest could be Jordan D.',
    })
    expect(placeReceipt(read(), organizer, guests)).toMatchObject({ kind: 'unmatched' })
  })

  it('never trusts a sender it couldn’t verify, but suggests who it looks like', () => {
    expect(placeReceipt(sent(), { ...marcus, verified: false }, guests)).toEqual({
      kind: 'unmatched',
      reason: 'We couldn’t check that it really came from that address.',
      suggestedGuestId: 'm',
    })
  })

  it('refuses junk from strangers, and keeps a stranger’s payment for the organizer', () => {
    expect(placeReceipt(read({ amountCents: null }), from('spam@example.net'), guests)).toEqual({
      kind: 'rejected',
      reason: NOT_A_PAYMENT,
    })
    expect(
      placeReceipt(read({ payerName: 'Kendra Smith' }), from('kendra.work@example.net'), guests)
    ).toEqual({
      kind: 'unmatched',
      reason: 'It came from an address that isn’t on this trip.',
      suggestedGuestId: 'k',
    })
  })

  it('asks which traveler when the sender looks after several', () => {
    const mom = from('mom@example.com', { userId: 'u-mom' })
    const family = [
      guest('kid1', 'Ava', 'Ray', { userId: null, managedByUserId: 'u-mom' }),
      guest('kid2', 'Ben', 'Ray', { userId: null, managedByUserId: 'u-mom' }),
    ]
    expect(placeReceipt(sent(), mom, family)).toMatchObject({
      kind: 'unmatched',
      suggestedGuestId: null,
    })
    expect(placeReceipt(sent(), mom, family.slice(0, 1))).toEqual({
      kind: 'guest',
      guestId: 'kid1',
    })
  })

  it('never picks a turned-down guest', () => {
    expect(
      placeReceipt(sent(), from('tasha@example.com', { userId: 'u-tasha' }), guests)
    ).toMatchObject({ kind: 'unmatched', reason: 'It came from a guest who was turned down.' })
    expect(placeReceipt(read({ payerName: 'Tasha Grant' }), organizer, guests)).toMatchObject({
      kind: 'unmatched',
    })
  })

  it('waits for the organizer when the guest can’t pay yet', () => {
    const waiting = [guest('k', 'Kendra', 'Smith', { status: 'interested' })]
    expect(placeReceipt(sent(), kendra, waiting, 'accept_first')).toMatchObject({
      kind: 'unmatched',
      reason: 'Kendra isn’t accepted yet, so they haven’t been shown how to pay.',
    })
    expect(placeReceipt(sent(), kendra, waiting, 'pay_first')).toEqual({
      kind: 'guest',
      guestId: 'k',
    })
    const listed = [guest('k', 'Kendra', 'Smith', { status: 'interested', waitlistedAt: 'x' })]
    expect(placeReceipt(sent(), kendra, listed, 'first_come')).toMatchObject({
      kind: 'unmatched',
      reason: 'Kendra is on the waitlist and hasn’t been offered a spot.',
    })
    const refunded = [guest('k', 'Kendra', 'Smith', { refundSentAt: 'x' })]
    expect(placeReceipt(sent(), kendra, refunded)).toMatchObject({
      kind: 'unmatched',
      reason: 'Kendra was refunded.',
    })
  })

  it('asks before recording what looks like a payment already there', () => {
    const paid = [
      guest('k', 'Kendra', 'Smith', {
        payments: [{ guestPaymentAmount: 30000, sentOn: '2026-10-21', status: 'reported' }],
      }),
    ]
    expect(placeReceipt(sent(), kendra, paid)).toEqual({
      kind: 'unmatched',
      reason: 'Kendra already has a $300 payment from Oct 21. It may be the same one.',
      suggestedGuestId: 'k',
    })
    expect(placeReceipt(sent({ sentOn: '2026-11-22' }), kendra, paid)).toEqual({
      kind: 'guest',
      guestId: 'k',
    })
  })

  it('asks for the amount when it couldn’t read one', () => {
    expect(placeReceipt(sent({ amountCents: null }), kendra, guests)).toMatchObject({
      kind: 'unmatched',
      suggestedGuestId: 'k',
    })
  })
})

describe('guestsNamed', () => {
  it('matches the whole name, then first and last, then first and last initial', () => {
    const g = [guest('a', 'Mary Ann', 'Jones'), guest('b', 'José', 'Núñez')]
    expect(guestsNamed('mary ann jones', g).map((x) => x.id)).toEqual(['a'])
    expect(guestsNamed('Mary Q. Jones', g).map((x) => x.id)).toEqual(['a'])
    expect(guestsNamed('Jose Nunez', g).map((x) => x.id)).toEqual(['b'])
    expect(guestsNamed('Jose N', g).map((x) => x.id)).toEqual(['b'])
    expect(guestsNamed('Jose', g)).toEqual([])
  })
})

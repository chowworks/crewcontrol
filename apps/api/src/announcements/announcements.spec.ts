import { BadRequestException } from '@nestjs/common'
import type { Guest, GuestTerms, OrganizerTrip } from '../trips/trip-types'
import { parseAnnouncement, parseReply } from './announcements.controller'
import { audienceOf, shortName } from './announcements.service'

// Who an announcement goes to, how a guest's reply is signed, and what the forms accept.
const terms = (paidCents: number): GuestTerms =>
  ({
    priceCents: 1200,
    installmentCount: 1,
    firstInstallmentCents: 1200,
    paidCents,
    pendingCents: 0,
    adjustmentCents: 0,
    balanceCents: 1200 - paidCents,
    schedule: [],
  }) as unknown as GuestTerms

const guest = (id: string, over: Partial<Guest> = {}): Guest =>
  ({ id, status: 'approved', terms: terms(0), ...over }) as Guest

const trip = {
  guests: [
    guest('accepted-owes'),
    guest('accepted-paid', { terms: terms(1200) }),
    guest('waiting', { status: 'interested' }),
    guest('turned-down', { status: 'declined' }),
  ],
} as OrganizerTrip

const ids = (gs: Guest[]) => gs.map((g) => g.id)

describe('audienceOf', () => {
  it('reaches accepted guests only, never anyone waiting or turned down', () => {
    expect(ids(audienceOf(trip, 'accepted'))).toEqual(['accepted-owes', 'accepted-paid'])
  })
  it('reaches the accepted guests who still owe', () => {
    expect(ids(audienceOf(trip, 'owing'))).toEqual(['accepted-owes'])
  })
})

describe('shortName', () => {
  it('signs a reply with a first name and an initial', () => {
    expect(shortName('Monique', 'Hill')).toBe('Monique H.')
    expect(shortName('Cher', '')).toBe('Cher')
  })
})

describe('parseAnnouncement', () => {
  const ok = { body: '  Check-in is at 4.  ', audience: 'accepted', email: true, pinned: false }
  it('trims the message', () => {
    expect(parseAnnouncement(ok)).toEqual({ ...ok, body: 'Check-in is at 4.' })
  })
  it('refuses an empty message, an unknown group or a missing tick', () => {
    expect(() => parseAnnouncement({ ...ok, body: ' ' })).toThrow(BadRequestException)
    expect(() => parseAnnouncement({ ...ok, audience: 'everyone' })).toThrow(BadRequestException)
    expect(() => parseAnnouncement({ ...ok, email: 'yes' })).toThrow(BadRequestException)
    expect(() => parseAnnouncement({ ...ok, body: 'x'.repeat(4001) })).toThrow(BadRequestException)
  })
  it('refuses an empty or too long reply', () => {
    expect(parseReply({ body: ' On my way ' })).toBe('On my way')
    expect(() => parseReply({ body: '' })).toThrow(BadRequestException)
    expect(() => parseReply({ body: 'x'.repeat(2001) })).toThrow(BadRequestException)
  })
})

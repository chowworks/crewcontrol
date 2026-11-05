import type { GuestEvent, TripLogEntry } from '@cc/types'
import { describe, expect, it } from 'vitest'
import { logType } from './tripLogTypes'

const at = '2026-11-01T12:00:00Z'
const guest = (kind: GuestEvent['kind']): TripLogEntry => ({
  kind: 'guest',
  at,
  guestId: 'g1',
  guestName: 'Kendra',
  event: {
    at,
    kind,
    actor: 'guest',
    fromRoom: null,
    toRoom: null,
    fields: [],
    amount: null,
    reason: null,
    byName: null,
  },
})
const change = (c: Extract<TripLogEntry, { kind: 'change' }>['change']): TripLogEntry => ({
  kind: 'change',
  at,
  byAdmin: false,
  actorName: 'Marcus',
  change: c,
})

describe('logType', () => {
  it('puts money lines under Payments', () => {
    expect(logType(guest('said_paid'))).toBe('payments')
    expect(logType(guest('refund_sent'))).toBe('payments')
    expect(logType(guest('credit_added'))).toBe('payments')
    expect(
      logType(change({ what: 'expense', action: 'added', payee: 'Chef', amount: '$300' }))
    ).toBe('payments')
  })

  it('puts a guest’s spot and details under Guests', () => {
    expect(logType(guest('joined'))).toBe('guests')
    expect(logType(guest('accepted'))).toBe('guests')
    expect(logType(guest('room_changed'))).toBe('guests')
    expect(logType(change({ what: 'interest_removed', name: 'Dana' }))).toBe('guests')
  })

  it('puts announcements, questions and launching sign-ups under Communications', () => {
    expect(logType(change({ what: 'announcement', action: 'posted', text: 'Hi' }))).toBe('comms')
    expect(logType(change({ what: 'signups_opened', emailed: 3 }))).toBe('comms')
    expect(
      logType({
        kind: 'question',
        at,
        action: 'asked',
        name: 'Dana',
        askerName: null,
        question: 'Parking?',
        status: 'public',
      } as TripLogEntry)
    ).toBe('comms')
  })

  it('puts editor saves and who runs the trip under Trip changes', () => {
    expect(
      logType(change({ what: 'trip', fields: [{ field: 'price', from: '$1', to: '$2' }] }))
    ).toBe('changes')
    expect(logType(change({ what: 'trip_deleted' }))).toBe('changes')
    expect(
      logType({
        kind: 'people',
        at,
        action: 'insert',
        byAdmin: false,
        actorName: 'Marcus',
        subjectName: 'Dana',
        self: false,
        role: 'organizer',
        oldRole: null,
      })
    ).toBe('changes')
  })
})

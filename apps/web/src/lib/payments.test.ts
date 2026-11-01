import type { Payment } from '@cc/types'
import { describe, expect, it } from 'vitest'
import { confirmedLookalike, shown } from './payments'

const pay = (more: Partial<Payment>): Payment =>
  ({
    id: 'p1',
    guestPaymentAmount: 20000,
    receivedPaymentAmount: 20000,
    sentOn: '2026-11-01',
    status: 'confirmed',
    ...more,
  }) as Payment

describe('confirmedLookalike', () => {
  it('finds a confirmed payment of the same amount sent within three days', () => {
    expect(confirmedLookalike([pay({})], 20000, '2026-11-03')?.id).toBe('p1')
  })

  it('ignores the payment itself, other amounts, other weeks and payments not confirmed', () => {
    expect(confirmedLookalike([pay({})], 20000, '2026-11-01', 'p1')).toBeNull()
    expect(confirmedLookalike([pay({})], 30000, '2026-11-01')).toBeNull()
    expect(confirmedLookalike([pay({})], 20000, '2026-11-08')).toBeNull()
    expect(
      confirmedLookalike(
        [pay({ status: 'reported', receivedPaymentAmount: null })],
        20000,
        '2026-11-01'
      )
    ).toBeNull()
  })
})

describe('shown', () => {
  it('leaves out a payment an organizer logged and removed, and a removed credit or charge', () => {
    expect(shown.payment({ loggedBy: 'organizer', status: 'not_received' })).toBe(false)
    expect(shown.payment({ loggedBy: 'organizer', status: 'confirmed' })).toBe(true)
    // A guest's payment that never arrived stays: it says something to them and the organizer.
    expect(shown.payment({ loggedBy: 'guest', status: 'not_received' })).toBe(true)
    expect(shown.adjustment({ removedAt: '2026-11-01T20:00:00Z' })).toBe(false)
    expect(shown.adjustment({ removedAt: null })).toBe(true)
  })
})

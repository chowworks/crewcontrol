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
  const show = (p: Payment, all: Payment[] = [p]) => shown.payment(p, 0, all)
  it('leaves out a payment an organizer logged and removed, and a removed credit or charge', () => {
    expect(show(pay({ loggedBy: 'organizer', status: 'not_received' }))).toBe(false)
    expect(show(pay({ loggedBy: 'organizer', status: 'confirmed' }))).toBe(true)
    expect(shown.adjustment({ removedAt: '2026-11-01T20:00:00Z' })).toBe(false)
    expect(shown.adjustment({ removedAt: null })).toBe(true)
  })

  it('leaves out a duplicate marked not received, but shows one that really didn’t arrive', () => {
    const missing = pay({
      id: 'p0',
      loggedBy: 'guest',
      status: 'not_received',
      receivedPaymentAmount: null,
    })
    // Nothing else confirmed: their money didn't arrive, and they need to see that.
    expect(show(missing)).toBe(true)
    // The same $200 confirmed from a forwarded receipt: it was the same money reported twice.
    const receipt = pay({ id: 'p1', loggedBy: 'email' })
    expect(show(missing, [missing, receipt])).toBe(false)
  })
})

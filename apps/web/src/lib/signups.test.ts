import type { Guest } from '@cc/types'
import { describe, expect, it } from 'vitest'
import { signupOrder } from './signups'

const g = (
  id: string,
  createdAt: string,
  sent: string | null,
  confirmed: string | null,
  status: Guest['status'] = 'interested'
): Guest => ({
  id,
  firstName: id,
  lastName: '',
  email: `${id}@example.com`,
  phone: '555-0100',
  status,
  createdAt,
  paymentSentAt: sent,
  paymentConfirmedAt: confirmed,
  refundSentAt: null,
  roomId: null,
  roomNote: '',
  signedAt: createdAt,
  terms: null,
})

describe('signupOrder', () => {
  it('puts confirmed payments first, in confirmation order, then paid, then the rest, then the turned down', () => {
    const list = [
      g('turned-down', '2026-10-01T00:00:00Z', null, '2026-10-02T00:00:00Z', 'declined'),
      g(
        'late-signup-confirmed-first',
        '2026-11-03T00:00:00Z',
        '2026-11-03T00:00:00Z',
        '2026-11-03T09:00:00Z'
      ),
      g(
        'early-signup-confirmed-second',
        '2026-11-01T00:00:00Z',
        '2026-11-01T00:00:00Z',
        '2026-11-03T10:00:00Z'
      ),
      g('no-payment', '2026-10-30T00:00:00Z', null, null),
      g('paid-unconfirmed', '2026-11-02T00:00:00Z', '2026-11-02T00:00:00Z', null),
    ]
    expect(signupOrder(list).map((x) => x.id)).toEqual([
      'late-signup-confirmed-first',
      'early-signup-confirmed-second',
      'paid-unconfirmed',
      'no-payment',
      'turned-down',
    ])
  })
})

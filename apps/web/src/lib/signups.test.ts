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
  spotPaidAt: confirmed,
  refundSentAt: null,
  payments: sent
    ? [
        {
          id: `p-${id}`,
          guestPaymentAmount: 500,
          receivedPaymentAmount: confirmed ? 500 : null,
          method: 'Zelle',
          methodKind: 'zelle',
          sentOn: sent.slice(0, 10),
          note: '',
          status: confirmed ? 'confirmed' : 'reported',
          loggedBy: 'guest',
          reportedAt: sent,
          decidedAt: confirmed,
        },
      ]
    : [],
  roomId: null,
  roomNote: '',
  signedAt: createdAt,
  terms: null,
})

describe('signupOrder', () => {
  it('puts paid spots first, in the order they were paid, then reported payments, then the rest, then the turned down', () => {
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

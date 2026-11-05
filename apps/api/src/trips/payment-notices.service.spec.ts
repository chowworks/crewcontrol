import type { EmailsService } from '../messaging/emails.service'
import type { PrismaService } from '../prisma/prisma.service'
import { PaymentNoticesService } from './payment-notices.service'
import type { TripsService } from './trips.service'

// The trip as Trip Control sees it is the stand-in row itself.
jest.mock('./trip-mapper', () => ({ toOrganizerTrip: (row: unknown) => row }))

// The run that emails a guest whose payment was marked not received: once it's due, once only, with why.
const now = new Date('2026-11-05T12:00:00Z')

function setup(notifyGuestAt: Date | null, status = 'not_received') {
  const payment = {
    id: 'p1',
    tripId: 't1',
    guestId: 'g1',
    guestPaymentAmount: 40000,
    receivedPaymentAmount: null,
    method: 'Zelle · (555) 010-0199',
    methodKind: 'zelle',
    sentOn: '2026-11-03',
    note: '',
    status,
    loggedBy: 'guest',
    paidByName: '',
    transferId: null,
    reportedAt: now,
    decidedAt: now,
    decidedByUserId: 'u1',
    refundedAt: null,
    decisionNote: 'Nothing came through',
    notifyGuestAt,
  }
  const prisma = {
    payment: {
      findMany: jest.fn(async () =>
        payment.notifyGuestAt && payment.notifyGuestAt <= now && payment.status === 'not_received'
          ? [{ id: 'p1', tripId: 't1', guestId: 'g1' }]
          : []
      ),
      updateMany: jest.fn(async () => {
        if (!payment.notifyGuestAt) return { count: 0 }
        payment.notifyGuestAt = null
        return { count: 1 }
      }),
    },
    trip: { findFirst: jest.fn(async () => tripRow()) },
    room: { findFirst: jest.fn(async () => null) },
  }
  const tripRow = () => ({
    id: 't1',
    slug: 'aruba-2028',
    name: 'Aruba',
    destination: 'Aruba',
    startDate: '2028-03-03',
    endDate: '2028-03-08',
    description: '',
    organizerName: 'Nia',
    pricePerPerson: 120000,
    installmentCount: 1,
    paymentMethods: [],
    paymentInstructions: '',
    photos: [],
    highlights: [],
    keyDates: [],
    options: {},
    joinMode: 'accept_first',
    maxGuests: null,
    guests: [
      {
        id: 'g1',
        tripId: 't1',
        firstName: 'Dana',
        lastName: 'Reyes',
        email: 'dana@example.com',
        phone: '555',
        status: 'approved',
        createdAt: now,
        payments: [payment],
        adjustments: [],
        agreement: null,
      },
    ],
  })
  const emails = { sendToGuest: jest.fn(async () => undefined) }
  const trips = {
    organizerContact: jest.fn(async () => ({ name: 'Nia', email: 'nia@example.com' })),
  }
  const service = new PaymentNoticesService(
    prisma as unknown as PrismaService,
    trips as unknown as TripsService,
    emails as unknown as EmailsService
  )
  return { service, emails }
}

describe('PaymentNoticesService', () => {
  it('emails the guest once it is due, with which payment and why, and only once', async () => {
    const { service, emails } = setup(new Date(now.getTime() - 1000))
    expect(await service.run(now)).toBe(1)
    expect(await service.run(now)).toBe(0)
    expect(emails.sendToGuest).toHaveBeenCalledTimes(1)
    const [kind, , facts, , extra] = emails.sendToGuest.mock.calls[0] as unknown as [
      string,
      unknown,
      { email: string; replyTo: string },
      string,
      { payment: Record<string, string> },
    ]
    expect(kind).toBe('payment_not_received')
    expect(facts).toMatchObject({ email: 'dana@example.com', replyTo: 'nia@example.com' })
    expect(extra.payment).toEqual({
      amount: '$400',
      sentOn: 'Nov 3, 2026',
      method: 'Zelle',
      reason: 'Nothing came through',
    })
  })

  it('waits until the minute is up, and sends nothing once it was undone', async () => {
    expect(await setup(new Date(now.getTime() + 1000)).service.run(now)).toBe(0)
    expect(await setup(null).service.run(now)).toBe(0)
  })
})

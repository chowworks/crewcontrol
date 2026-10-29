import type { ForwardedReceipt } from '@prisma/client'
import type { ClerkService } from '../auth/clerk.service'
import type { PrismaService } from '../prisma/prisma.service'
import type { TripsService } from '../trips/trips.service'
import { ForwardedReceiptsService, MAX_ATTEMPTS, NO_TRIP } from './forwarded-receipts.service'

// The worker's handling of one email, with the database, Clerk and Resend stood in for: where it goes, what it
// records, and what happens when Resend doesn't answer. Fictional people only.
const DOMAIN = 'receipts.travel-hq.app'

const trip = {
  id: 'T',
  receiptsAddress: 'mv-house',
  paymentMethods: [{ kind: 'zelle', label: '', handle: '(555) 010-0199' }],
  members: [{ userId: 'u-org' }],
  payerAddresses: [] as { address: string; guestId: string }[],
  guests: [
    {
      id: 'G',
      firstName: 'Kendra',
      lastName: 'Smith',
      status: 'approved',
      email: 'kendra@example.com',
      userId: 'u-kendra',
      managedByUserId: null,
      payments: [],
    },
  ],
}

function setup(email: Record<string, unknown>, foundTrip: unknown = trip) {
  const payment = jest.fn(async () => ({ id: 'P1' }))
  const recorded = jest.fn(async () => ({}))
  const settle = jest.fn(async () => ({}))
  const prisma = {
    trip: { findFirst: jest.fn(async () => foundTrip) },
    receiptsAddress: {
      findFirst: jest.fn(async () => ({ firstUsedAt: new Date('2026-01-01'), id: 'a' })),
    },
    forwardedReceipt: { updateMany: settle },
    $transaction: async (fn: (tx: unknown) => Promise<void>) =>
      fn({ payment: { create: payment }, forwardedReceipt: { update: recorded } }),
  } as unknown as PrismaService
  const clerk = {
    verifiedEmails: jest.fn(async (id: string) =>
      id === 'u-org' ? ['chris@example.com'] : id === 'u-kendra' ? ['kendra@example.com'] : []
    ),
    userIdByEmail: jest.fn(async (e: string) => (e === 'kendra@example.com' ? 'u-kendra' : null)),
  } as unknown as ClerkService
  const accept = jest.fn(async () => undefined)
  const service = new ForwardedReceiptsService(
    prisma,
    { firstComeAcceptAsSystem: accept } as unknown as TripsService,
    clerk
  )
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => email })) as never
  return { service, payment, recorded, settle, accept }
}

const row = (more: Partial<ForwardedReceipt> = {}) =>
  ({
    id: 'R1',
    emailId: 'em_1',
    toAddress: `mv-house@${DOMAIN}`,
    fromAddress: 'chris@example.com',
    subject: 'Fwd: Zelle',
    receivedAt: new Date('2026-10-22T15:00:00Z'),
    attempts: 1,
    ...more,
  }) as ForwardedReceipt

const zelle = (from: string, dmarc = 'pass') => ({
  id: 'em_1',
  from,
  to: [`mv-house@${DOMAIN}`],
  subject: 'Fwd: You received money with Zelle',
  created_at: '2026-10-22T15:00:00Z',
  text: 'Date: Oct 21, 2026\nKendra Smith sent you $300.00',
  html: null,
  authentication: { dmarc },
})

describe('ForwardedReceiptsService.process', () => {
  beforeAll(() => {
    process.env.RECEIPTS_DOMAIN = DOMAIN
    process.env.RESEND_RECEIVING_API_KEY = 're_test'
    process.env.RESEND_WEBHOOK_SECRET = 'whsec_test'
  })
  afterAll(() => {
    delete process.env.RECEIPTS_DOMAIN
    delete process.env.RESEND_RECEIVING_API_KEY
    delete process.env.RESEND_WEBHOOK_SECRET
  })

  it('confirms an organizer’s forward as the named guest’s payment, in the trip’s words', async () => {
    const { service, payment, recorded, accept } = setup(zelle('Chris <chris@example.com>'))
    await service.process(row(), DOMAIN)
    expect(payment).toHaveBeenCalledWith({
      data: {
        tripId: 'T',
        guestId: 'G',
        guestPaymentAmount: 30000,
        method: 'Zelle · (555) 010-0199',
        methodKind: 'zelle',
        sentOn: '2026-10-21',
        paidByName: '',
        loggedBy: 'email',
        status: 'confirmed',
        receivedPaymentAmount: 30000,
        decidedAt: expect.any(Date),
      },
    })
    expect(accept).toHaveBeenCalledWith('T', 'G')
    expect(recorded).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'R1' },
        data: expect.objectContaining({ status: 'recorded', guestId: 'G', paymentId: 'P1' }),
      })
    )
  })

  it('leaves a guest’s own forward for the organizer to confirm, unless the trip confirms them', async () => {
    const sent = (from: string) => ({
      ...zelle(from),
      subject: 'Fwd: You sent money with Zelle',
      text: 'Date: Oct 21, 2026\nYou sent $300.00 to Chris Howard',
    })
    const off = setup(sent('Kendra <kendra@example.com>'))
    await off.service.process(row({ fromAddress: 'kendra@example.com' }), DOMAIN)
    expect(off.payment).toHaveBeenCalledWith({
      data: expect.objectContaining({ guestId: 'G', loggedBy: 'email', status: 'reported' }),
    })
    expect(off.accept).not.toHaveBeenCalled()

    const on = setup(sent('Kendra <kendra@example.com>'), {
      ...trip,
      options: { confirmReceipts: true },
    })
    await on.service.process(row({ fromAddress: 'kendra@example.com' }), DOMAIN)
    expect(on.payment).toHaveBeenCalledWith({
      data: expect.objectContaining({ guestId: 'G', status: 'confirmed' }),
    })
    expect(on.accept).toHaveBeenCalledWith('T', 'G')
  })

  it('files a forward from an address the organizer tied to a guest on that guest', async () => {
    const { service, payment } = setup(
      {
        ...zelle('Kendra <Kendra.Work@example.net>'),
        text: 'Date: Oct 21, 2026\nYou sent $300.00 to Chris Howard',
      },
      { ...trip, payerAddresses: [{ address: 'kendra.work@example.net', guestId: 'G' }] }
    )
    await service.process(row({ fromAddress: 'kendra.work@example.net' }), DOMAIN)
    expect(payment).toHaveBeenCalledWith({
      data: expect.objectContaining({ guestId: 'G', status: 'reported' }),
    })
  })

  it('leaves one from an unverified sender for the organizer, with its text', async () => {
    const { service, payment, settle } = setup(zelle('chris@example.com', 'fail'))
    await service.process(row(), DOMAIN)
    expect(payment).not.toHaveBeenCalled()
    expect(settle).toHaveBeenCalledWith({
      where: { id: 'R1', status: 'processing' },
      data: expect.objectContaining({
        status: 'unmatched',
        tripId: 'T',
        suggestedGuestId: 'G',
        amountCents: 30000,
        excerpt: expect.stringContaining('Kendra Smith sent you $300.00'),
      }),
    })
  })

  it('refuses mail to an address no trip uses', async () => {
    const { service, settle } = setup(zelle('chris@example.com'), null)
    // No retired address either.
    ;(service as unknown as { prisma: PrismaService }).prisma.receiptsAddress.findFirst = jest.fn(
      async () => null
    ) as never
    await service.process(row(), DOMAIN)
    expect(settle).toHaveBeenCalledWith({
      where: { id: 'R1', status: 'processing' },
      data: { status: 'rejected', reason: NO_TRIP, error: null },
    })
  })

  it('tries again later when Resend doesn’t answer, and gives up after the last try', async () => {
    const { service, settle } = setup(zelle('chris@example.com'))
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 503,
      json: async () => ({}),
    })) as never
    await service.process(row(), DOMAIN)
    expect(settle).toHaveBeenLastCalledWith({
      where: { id: 'R1', status: 'processing' },
      data: expect.objectContaining({ status: 'received', error: 'Resend answered 503' }),
    })
    await service.process(row({ attempts: MAX_ATTEMPTS }), DOMAIN)
    expect(settle).toHaveBeenLastCalledWith({
      where: { id: 'R1', status: 'processing' },
      data: { status: 'failed', error: 'Resend answered 503' },
    })
  })
})

describe('ForwardedReceiptsService.match', () => {
  const caller = { userId: 'u-org' } as never
  function matching(fromAddress: string | null) {
    const upsert = jest.fn(async () => ({}))
    const prisma = {
      forwardedReceipt: {
        findFirst: jest.fn(async () => ({
          id: 'R1',
          status: 'unmatched',
          fromAddress,
          methodKind: 'zelle',
        })),
      },
      $transaction: async (fn: (tx: unknown) => Promise<string>) =>
        fn({
          payment: { create: jest.fn(async () => ({ id: 'P1' })) },
          forwardedReceipt: { updateMany: jest.fn(async () => ({ count: 1 })) },
          payerAddress: { upsert },
        }),
    } as unknown as PrismaService
    const trips = {
      get: jest.fn(async () => ({
        ...trip,
        guests: [{ id: 'G', firstName: 'Kendra', status: 'approved' }],
      })),
    } as unknown as TripsService
    const service = new ForwardedReceiptsService(prisma, trips, {} as ClerkService)
    return { service, upsert }
  }
  const input = { guestId: 'G', amountCents: 30000, sentOn: '2026-10-21', confirm: false }

  it('remembers the sender for that guest when asked, in lower case', async () => {
    const { service, upsert } = matching('Kendra.Work@example.net')
    await service.match('T', 'R1', { ...input, remember: true }, caller)
    expect(upsert).toHaveBeenCalledWith({
      where: { tripId_address: { tripId: 'T', address: 'kendra.work@example.net' } },
      create: {
        tripId: 'T',
        guestId: 'G',
        address: 'kendra.work@example.net',
        createdByUserId: 'u-org',
      },
      update: { guestId: 'G', createdByUserId: 'u-org' },
    })
  })

  it('remembers nothing unless asked, or with no address to remember', async () => {
    const off = matching('kendra.work@example.net')
    await off.service.match('T', 'R1', { ...input, remember: false }, caller)
    expect(off.upsert).not.toHaveBeenCalled()
    const none = matching(null)
    await none.service.match('T', 'R1', { ...input, remember: true }, caller)
    expect(none.upsert).not.toHaveBeenCalled()
  })
})

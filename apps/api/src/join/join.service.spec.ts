import { BadRequestException } from '@nestjs/common'
import type { ClerkService } from '../auth/clerk.service'
import type { EmailsService } from '../messaging/emails.service'
import type { PrismaService } from '../prisma/prisma.service'
import type { TermsService } from '../terms/terms.service'
import type { PaymentReport } from '../trips/trip-types'
import type { TripsService } from '../trips/trips.service'
import { owed } from './guest-pay'
import { JoinService } from './join.service'

// One payment for several travelers (issue #11), on a stand-in database: the person who signed travelers up pays for
// them and themselves in one go, recorded as one payment each, naming who sent it.
const caller = { userId: 'mom', isAdmin: false }
const at = new Date('2026-10-20T15:00:00Z')

function row(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    tripId: 't1',
    userId: null as string | null,
    managedByUserId: 'mom' as string | null,
    firstName: id,
    lastName: 'Reyes',
    status: 'interested',
    createdAt: at,
    spotPaidAt: null,
    refundSentAt: null,
    waitlistedAt: null,
    offeredAt: null,
    roomId: null,
    payments: [],
    // The price is 1000 in two installments: 500 is due now.
    agreement: {
      id: `s-${id}`,
      priceCents: 1000,
      installmentCount: 2,
      startDate: 's',
      endDate: 'e',
      refundTerms: 'r',
      templateVersion: 'v',
      text: 't',
      textHash: 'h',
      typedName: 'Dana Reyes',
      signedAt: at,
      ipAddress: '',
      userAgent: '',
    },
    trip: {
      paymentInstructions: '',
      paymentMethods: [{ kind: 'zelle', label: '', handle: '555' }],
    },
    ...extra,
  }
}

function service(rows: ReturnType<typeof row>[]) {
  const created: Record<string, unknown>[] = []
  const prisma = {
    guest: { findMany: jest.fn(async () => rows) },
    trip: { findUniqueOrThrow: jest.fn(async () => ({ id: 't1' })) },
    $queryRaw: jest.fn<Promise<{ signer: string | null }[]>, unknown[]>(async () => [
      { signer: null },
    ]),
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<void>) =>
      fn({
        $queryRaw: (...args: unknown[]) => prisma.$queryRaw(...args),
        payment: {
          create: async ({ data }: { data: Record<string, unknown> }) => created.push(data),
        },
      })
    ),
  }
  const trips = {
    organizerContact: jest.fn(async () => null),
    getPublic: jest.fn(async () => ({
      slug: 'trip',
      name: 'Trip',
      destination: 'D',
      startDate: 's',
      endDate: 'e',
      organizerName: 'Chris',
      costPerPersonCents: 1000,
      installmentCount: 2,
      joinMode: 'pay_first',
      refundPolicy: 'spot_filled',
      maxGuests: null,
      spotsTaken: 0,
    })),
  }
  const terms = { status: jest.fn(async () => ({ accepted: true, version: 'v' })) }
  const clerk = { verifiedEmails: jest.fn(async () => []) }
  const s = new JoinService(
    prisma as unknown as PrismaService,
    trips as unknown as TripsService,
    terms as unknown as TermsService,
    clerk as unknown as ClerkService,
    { sendToGuest: jest.fn() } as unknown as EmailsService
  )
  return { s, created, prisma }
}

const report = (forGuests: PaymentReport['forGuests'], note = ''): PaymentReport => ({
  guestPaymentAmount: (forGuests ?? []).reduce((n, x) => n + x.amount, 0),
  methodIndex: 0,
  sentOn: '2026-10-24',
  note,
  certified: true,
  forGuests,
})

describe('one payment for several travelers', () => {
  it('records one payment per traveler, naming who sent it, and none for the payer’s own share', async () => {
    const { s, created } = service([
      row('mom', { userId: 'mom', managedByUserId: null, firstName: 'Dana' }),
      row('ava'),
      row('ben'),
    ])
    await s.reportPayment(
      'trip',
      report([
        { guestId: 'mom', amount: 500 },
        { guestId: 'ava', amount: 500 },
        { guestId: 'ben', amount: 500 },
      ]),
      caller
    )
    // One transfer: the organizer confirms it once.
    expect(new Set(created.map((p) => p.transferId)).size).toBe(1)
    expect(created[0].transferId).toEqual(expect.any(String))
    expect(created.map((p) => [p.guestId, p.guestPaymentAmount, p.paidByName])).toEqual([
      ['mom', 500, ''],
      ['ava', 500, 'Dana Reyes'],
      ['ben', 500, 'Dana Reyes'],
    ])
  })

  it('works for someone who isn’t on the trip, named as they signed', async () => {
    const { s, created } = service([row('ava')])
    await s.reportPayment('trip', report([{ guestId: 'ava', amount: 500 }]), caller)
    expect(created).toMatchObject([{ guestId: 'ava', paidByName: 'Dana Reyes', transferId: null }])
  })

  it.each([
    [[{ guestId: 'zoe', amount: 500 }], '', /only for yourself and the travelers you signed up/],
    [[{ guestId: 'ava', amount: 1100 }], '', /more than ava has left/],
    [[{ guestId: 'ava', amount: 200 }], '', /less than what’s due/],
    [
      [
        { guestId: 'ava', amount: 500 },
        { guestId: 'ava', amount: 500 },
      ],
      '',
      /Name each person once/,
    ],
  ])('refuses %j', async (shares, note, message) => {
    const { s, created } = service([row('ava')])
    await expect(s.reportPayment('trip', report(shares, note), caller)).rejects.toThrow(message)
    expect(created).toEqual([])
  })

  it('refuses amounts that don’t add up to the payment', async () => {
    const { s } = service([row('ava')])
    await expect(
      s.reportPayment(
        'trip',
        { ...report([{ guestId: 'ava', amount: 500 }]), guestPaymentAmount: 900 },
        caller
      )
    ).rejects.toThrow(BadRequestException)
  })
})

describe('a traveler someone else signed up', () => {
  it('is offered their place on the join page, and gets it only by saying it’s them', async () => {
    const { s, prisma } = service([])
    const ava = { userId: 'user_ava', isAdmin: false }
    prisma.$queryRaw.mockImplementation(async () => [{ signer: 'Dana Reyes' }])
    ;(
      s as unknown as { clerk: { verifiedEmails: jest.Mock } }
    ).clerk.verifiedEmails.mockResolvedValue(['ava@example.com'])
    const view = await s.view('trip', ava)
    expect(view.claimable).toEqual({ signedBy: 'Dana Reyes' })
    // Looking only asked (take = false).
    expect(prisma.$queryRaw.mock.calls.every((c: unknown[]) => c.at(-1) === false)).toBe(true)
    await s.claim('trip', {}, ava, { ip: '', userAgent: '' })
    expect(
      prisma.$queryRaw.mock.calls.some((c: unknown[]) => JSON.stringify(c).includes('true)'))
    ).toBe(true)
  })
})

describe('owed', () => {
  const terms = {
    priceCents: 120000,
    installmentCount: 4,
    startDate: '2027-06-18',
    endDate: '2027-06-21',
    refundTerms: 'r',
    firstInstallmentCents: 30000,
    paidCents: 0,
    pendingCents: 0,
    adjustmentCents: 0,
    balanceCents: 120000,
  }

  it("counts the organizer's adjustments in what's left, and never asks for more than that now", () => {
    expect(owed({ ...terms, adjustmentCents: 4000 })).toEqual({ left: 124000, dueNow: 30000 })
    expect(owed({ ...terms, paidCents: 100000, adjustmentCents: -5000 })).toEqual({
      left: 15000,
      dueNow: 0,
    })
    // A credit that leaves less than the first payment: only what's left is due.
    expect(owed({ ...terms, adjustmentCents: -100000 })).toEqual({ left: 20000, dueNow: 20000 })
  })
})

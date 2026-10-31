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
      paymentPlan: [
        { dueOn: null, amountCents: 500 },
        { dueOn: null, amountCents: 500 },
      ],
      joinMode: 'pay_first',
      refundPolicy: 'spot_filled',
      maxGuests: null,
      spotsTaken: 0,
      rooms: [],
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
    schedule: [],
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

// Signing someone else up (issue #46): the signer gets their copy, and the traveler hears who signed them up, unless
// the traveler's email is the signer's own (a parent signing up a child with their address).
describe('emails when someone signs a traveler up', () => {
  async function signUp(travelerEmail: string) {
    const sendToGuest = jest.fn()
    const traveler = {
      id: 'kid',
      status: 'interested',
      firstName: 'Ava',
      lastName: 'Reyes',
      waitlistedAt: null,
      offeredAt: null,
      roomId: null,
      terms: null,
      paymentMethods: [{ kind: 'zelle', label: '', handle: '555' }],
      paymentInstructions: '',
    }
    const view = {
      trip: {
        slug: 'trip',
        name: 'Trip',
        organizerName: 'Chris',
        joinMode: 'pay_first',
        refundPolicy: 'spot_filled',
        installmentCount: 1,
        startDate: 's',
        endDate: 'e',
        costPerPersonCents: 1000,
        paymentPlan: [{ dueOn: null, amountCents: 1000 }],
        rooms: [],
        options: {},
      },
      roomAgreements: [],
      agreement: { text: 't', textHash: 'h' },
      agreementOnBehalf: { text: 't', textHash: 'h' },
      me: null,
      managed: [] as unknown[],
      termsOfUse: { accepted: true, version: 'v' },
    }
    const tx = {
      guest: { create: async () => ({ id: 'kid' }) },
      agreementSignature: { create: async () => ({}) },
    }
    const s = new JoinService(
      {
        trip: { findUniqueOrThrow: async () => ({ id: 't1' }) },
        $transaction: async (fn: (t: unknown) => Promise<void>) => fn(tx),
      } as unknown as PrismaService,
      {
        organizerContact: async () => ({ name: 'Chris', email: 'chris@example.com' }),
      } as unknown as TripsService,
      {} as unknown as TermsService,
      {
        contact: async () => ({ name: 'Dana Reyes', email: 'dana@example.com' }),
      } as unknown as ClerkService,
      { sendToGuest } as unknown as EmailsService
    )
    jest
      .spyOn(s, 'view')
      .mockResolvedValueOnce(view as never)
      .mockResolvedValueOnce({ ...view, managed: [traveler] } as never)
    await s.join(
      'trip',
      {
        name: 'Ava Reyes',
        phone: '555 010 0100',
        email: travelerEmail,
        typedName: 'Dana Reyes',
        agreed: true,
        agreementHash: 'h',
        onBehalf: true,
      },
      caller,
      { ip: '', userAgent: '' }
    )
    return sendToGuest.mock.calls.map(([kind, , facts]) => [kind, facts.email, facts.signedBy])
  }

  it('sends the signer their copy and tells the traveler who signed them up', async () => {
    expect(await signUp('ava@example.com')).toEqual([
      ['signed_up_for', 'dana@example.com', 'Dana Reyes'],
      ['signed_up_by', 'ava@example.com', 'Dana Reyes'],
    ])
  })

  it('sends one email when the traveler uses the signer’s address', async () => {
    expect(await signUp('Dana@example.com')).toEqual([
      ['signed_up_for', 'dana@example.com', 'Dana Reyes'],
    ])
  })
})

import { BadRequestException, ConflictException } from '@nestjs/common'
import type { PrismaService } from '../prisma/prisma.service'
import { TripsService } from './trips.service'

// Trip Control's rules for a guest's spot and their payments, on a stand-in database: accepting needs a signature
// (and on the pay-first trips a confirmed payment), first come, first served trips accept once confirmed payments pay
// the spot while spots are left, and turning down a paid guest needs the refund ticked.
const caller = { userId: 'u1', isAdmin: false }
const at = new Date('2026-10-20T15:00:00Z')
// The agreement's price is 1000 in two installments: the first, which pays the spot, is 500.
const FIRST = 500

type PaymentRow = {
  id: string
  tripId: string
  guestId: string
  guestPaymentAmount: number
  receivedPaymentAmount: number | null
  method: string
  methodKind: string
  sentOn: string
  note: string
  status: string
  loggedBy: string
  reportedAt: Date
  decidedAt: Date | null
  decidedByUserId: string | null
  refundedAt?: Date | null
}

function payment(id: string, status = 'confirmed', amount = FIRST): PaymentRow {
  return {
    id,
    tripId: 't1',
    guestId: '',
    guestPaymentAmount: amount,
    receivedPaymentAmount: status === 'reported' ? null : amount,
    method: 'Zelle · 555',
    methodKind: 'zelle',
    sentOn: '2026-10-20',
    note: '',
    status,
    loggedBy: 'guest',
    reportedAt: at,
    decidedAt: status === 'reported' ? null : at,
    decidedByUserId: null,
  }
}

function guest(id: string, extra: Record<string, unknown> = {}) {
  const row = {
    id,
    tripId: 't1',
    userId: null,
    firstName: id,
    lastName: 'X',
    email: `${id}@example.com`,
    phone: '555',
    status: 'interested',
    createdAt: at,
    spotPaidAt: null as Date | null,
    refundSentAt: null as Date | null,
    waitlistedAt: null as Date | null,
    offeredAt: null as Date | null,
    roomId: null,
    roomNote: '',
    payments: [] as PaymentRow[],
    agreement: {
      signedAt: at,
      priceCents: 1000,
      installmentCount: 2,
      startDate: 's',
      endDate: 'e',
      refundTerms: 'r',
    } as Record<string, unknown> | null,
    ...extra,
  }
  for (const p of row.payments) p.guestId = id
  return row
}

/** A guest whose confirmed payment paid their spot at `when`. */
const paidGuest = (id: string, extra: Record<string, unknown> = {}, when = at) =>
  guest(id, { payments: [payment(`p-${id}`)], spotPaidAt: when, ...extra })

function setup(trip: Record<string, unknown>, guests: ReturnType<typeof guest>[]) {
  const writes: Record<string, unknown>[] = []
  const row = {
    id: 't1',
    slug: 't1',
    name: 'Trip',
    destination: 'D',
    startDate: '2027-01-01',
    endDate: '2027-01-02',
    organizerName: 'Sam',
    description: '',
    costPerPersonCents: 1000,
    installmentCount: 2,
    galleryTitle: 'Photos',
    showGuestNames: false,
    paymentMethods: [],
    paymentInstructions: '',
    published: true,
    isSample: false,
    maxGuests: null,
    joinMode: 'pay_first',
    photos: [],
    highlights: [],
    keyDates: [],
    createdAt: at,
    updatedAt: at,
    rooms: [],
    ...trip,
    guests,
  }
  // What the database's payment_logged trigger does: the spot is paid once confirmed payments cover the first one.
  const recount = (g: ReturnType<typeof guest>) => {
    const total = g.payments
      .filter((p) => p.status === 'confirmed')
      .reduce((n, p) => n + (p.receivedPaymentAmount ?? 0), 0)
    if (total >= FIRST && !g.spotPaidAt) g.spotPaidAt = new Date()
    if (total < FIRST) g.spotPaidAt = null
  }
  const owner = (paymentId: string) =>
    guests.find((g) => g.payments.some((p) => p.id === paymentId))!
  const prisma = {
    trip: { findFirst: async () => row },
    room: { findFirst: async () => null },
    systemSettings: { findUnique: async () => ({ waitlistBufferPercent: 10 }) },
    guest: {
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        writes.push(data)
        Object.assign(
          guests.find((g) => g.id === where.id)!,
          data
        )
        return {}
      },
    },
    payment: {
      update: async ({ where, data }: { where: { id: string }; data: Partial<PaymentRow> }) => {
        const g = owner(where.id)
        Object.assign(
          g.payments.find((p) => p.id === where.id)!,
          data
        )
        recount(g)
        return {}
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { guestId: string; status: string; refundedAt?: Date }
        data: Partial<PaymentRow>
      }) => {
        const g = guests.find((x) => x.id === where.guestId)!
        for (const p of g.payments)
          if (
            p.status === where.status &&
            (!where.refundedAt || p.refundedAt?.getTime() === where.refundedAt.getTime())
          )
            Object.assign(p, data)
        recount(g)
        return {}
      },
      create: async ({ data }: { data: Partial<PaymentRow> }) => {
        const g = guests.find((x) => x.id === data.guestId)!
        g.payments.push({ ...payment(`p${g.payments.length}`), ...data } as PaymentRow)
        recount(g)
        return {}
      },
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
  }
  const service = new TripsService(prisma as unknown as PrismaService)
  return { service, writes, guests }
}

describe('a guest’s spot in Trip Control', () => {
  it('accepts only a guest who signed and has a payment that arrived', async () => {
    const { service, writes } = setup({}, [
      guest('unsigned', { agreement: null, payments: [payment('p1')] }),
      guest('unpaid', { payments: [payment('p2', 'reported')] }),
      paidGuest('ready'),
    ])
    await expect(
      service.updateGuest('t1', 'unsigned', { status: 'approved' }, caller)
    ).rejects.toThrow(BadRequestException)
    await expect(
      service.updateGuest('t1', 'unpaid', { status: 'approved' }, caller)
    ).rejects.toThrow(/Confirm a payment from unpaid first/)
    await service.updateGuest('t1', 'ready', { status: 'approved' }, caller)
    expect(writes).toEqual([expect.objectContaining({ status: 'approved' })])
  })

  it('accepts a guest whose payments arrived short of the first one: accepting holds the spot', async () => {
    const { service, writes } = setup({}, [
      guest('short', { payments: [payment('p1', 'confirmed', 200)] }),
    ])
    await service.updateGuest('t1', 'short', { status: 'approved' }, caller)
    expect(writes[0]).toMatchObject({ status: 'approved' })
  })

  it('on an accept-first trip, accepts a guest who signed before they pay', async () => {
    const { service, writes } = setup({ joinMode: 'accept_first' }, [
      guest('unsigned', { agreement: null }),
      guest('signed'),
    ])
    await expect(
      service.updateGuest('t1', 'unsigned', { status: 'approved' }, caller)
    ).rejects.toThrow(/hasn’t signed/)
    await service.updateGuest('t1', 'signed', { status: 'approved' }, caller)
    expect(writes).toEqual([expect.objectContaining({ status: 'approved' })])
  })

  it('on an accept-first trip, lets the organizer undo an accepted guest’s payment', async () => {
    const { service, guests } = setup({ joinMode: 'accept_first' }, [
      paidGuest('in', { status: 'approved' }),
    ])
    await service.decidePayment('t1', 'p-in', { status: 'reported' }, caller)
    expect(guests[0].payments[0]).toMatchObject({ status: 'reported', receivedPaymentAmount: null })
    expect(guests[0].spotPaidAt).toBeNull()
  })

  it('keeps the spot limit', async () => {
    const { service } = setup({ maxGuests: 1 }, [
      paidGuest('in', { status: 'approved' }),
      paidGuest('next'),
    ])
    await expect(service.updateGuest('t1', 'next', { status: 'approved' }, caller)).rejects.toThrow(
      ConflictException
    )
  })

  it('confirms what the guest said they sent unless the organizer says otherwise', async () => {
    const { service, guests } = setup({}, [
      guest('a', { payments: [payment('pa', 'reported', 300)] }),
      guest('b', { payments: [payment('pb', 'reported', 500)] }),
    ])
    await service.decidePayment('t1', 'pa', { status: 'confirmed' }, caller)
    await service.decidePayment(
      't1',
      'pb',
      { status: 'confirmed', receivedPaymentAmount: 450 },
      caller
    )
    expect(guests[0].payments[0]).toMatchObject({ status: 'confirmed', receivedPaymentAmount: 300 })
    expect(guests[1].payments[0]).toMatchObject({ status: 'confirmed', receivedPaymentAmount: 450 })
  })

  it('accepts on the payment that pays the spot on a first come, first served trip, while spots are left', async () => {
    const { service, writes } = setup({ joinMode: 'first_come', maxGuests: 1 }, [
      guest('first', { payments: [payment('p1', 'reported')] }),
      guest('second'),
    ])
    await service.decidePayment('t1', 'p1', { status: 'confirmed' }, caller)
    expect(writes).toEqual([{ status: 'approved' }])
  })

  it('gives no first come spot for a payment short of the first one', async () => {
    const { service, writes } = setup({ joinMode: 'first_come' }, [
      guest('short', { payments: [payment('p1', 'reported', 200)] }),
    ])
    await service.decidePayment('t1', 'p1', { status: 'confirmed' }, caller)
    expect(writes).toEqual([])
  })

  it('confirms a payment on a full first come, first served trip without giving a spot', async () => {
    const { service, writes, guests } = setup({ joinMode: 'first_come', maxGuests: 1 }, [
      paidGuest('first', { status: 'approved' }),
      guest('second', { payments: [payment('p2', 'reported')] }),
    ])
    await service.decidePayment('t1', 'p2', { status: 'confirmed' }, caller)
    expect(writes).toEqual([])
    expect(guests[1].spotPaidAt).toEqual(expect.any(Date))
  })

  it('logs a payment handed over in person as confirmed', async () => {
    const { service, guests } = setup({}, [guest('cash')])
    await service.logPayment(
      't1',
      'cash',
      { receivedPaymentAmount: 500, method: 'Cash', sentOn: '2026-10-20', note: '' },
      caller
    )
    expect(guests[0].payments[0]).toMatchObject({
      status: 'confirmed',
      loggedBy: 'organizer',
      receivedPaymentAmount: 500,
    })
  })

  it('turns down a paid guest only with the refund ticked, frees their room and stops counting the payment', async () => {
    const { service, writes, guests } = setup({}, [paidGuest('paid', { roomId: 'r1' })])
    await expect(service.updateGuest('t1', 'paid', { status: 'declined' }, caller)).rejects.toThrow(
      /tick “Refund sent”/
    )
    await service.updateGuest('t1', 'paid', { status: 'declined', refundSent: true }, caller)
    expect(writes[0]).toMatchObject({
      status: 'declined',
      roomId: null,
      refundSentAt: expect.any(Date),
    })
    expect(guests[0].payments[0].status).toBe('refunded')
  })

  it('turns down an unpaid guest with no refund to send', async () => {
    const { service, writes } = setup({}, [guest('unpaid')])
    await service.updateGuest('t1', 'unpaid', { status: 'declined' }, caller)
    expect(writes[0]).toMatchObject({ status: 'declined' })
  })

  it('puts a refunded guest back to paying again, and never accepts them on the refunded payment', async () => {
    const refunded = payment('p1', 'refunded')
    const { service, writes } = setup({}, [
      guest('back', { status: 'declined', payments: [refunded], refundSentAt: at }),
    ])
    await expect(service.updateGuest('t1', 'back', { status: 'approved' }, caller)).rejects.toThrow(
      /was refunded/
    )
    await service.updateGuest('t1', 'back', { status: 'interested' }, caller)
    expect(writes[0]).toMatchObject({ status: 'interested', refundSentAt: null })
    expect(refunded.status).toBe('refunded')
  })

  it('lets an organizer move a guest accepted before payments were tracked', async () => {
    const { service, writes } = setup({}, [guest('old', { status: 'approved', agreement: null })])
    await service.updateGuest('t1', 'old', { roomId: null }, caller)
    expect(writes[0]).toMatchObject({ status: 'approved', roomId: null })
  })

  it('will not undo the payment of a guest who has a spot', async () => {
    const { service } = setup({}, [paidGuest('in', { status: 'approved' })])
    await expect(
      service.decidePayment('t1', 'p-in', { status: 'reported' }, caller)
    ).rejects.toThrow(/Put them back to waiting/)
  })

  it('records a refund only when turning a guest down', async () => {
    const { service } = setup({}, [paidGuest('paid')])
    await expect(service.updateGuest('t1', 'paid', { refundSent: true }, caller)).rejects.toThrow(
      /only when turning a guest down/
    )
  })

  it('on a first come trip, gives a freed spot to the guest whose spot was paid first', async () => {
    const later = new Date(at.getTime() + 3600_000)
    const { service, writes } = setup({ joinMode: 'first_come', maxGuests: 2 }, [
      paidGuest('in', { status: 'approved' }),
      paidGuest('early'),
      paidGuest('late', {}, later),
      guest('new', { payments: [payment('pn', 'reported')] }),
    ])
    await expect(service.updateGuest('t1', 'late', { status: 'approved' }, caller)).rejects.toThrow(
      /early’s payment was confirmed first/
    )
    // Confirming another payment while someone is ahead records it without a spot.
    await service.decidePayment('t1', 'pn', { status: 'confirmed' }, caller)
    expect(writes).toEqual([])
  })

  it('keeps who gets a spot fixed once guests have signed', async () => {
    const { service } = setup({}, [guest('signed')])
    await expect(service.update('t1', { joinMode: 'first_come' } as never, caller)).rejects.toThrow(
      /can’t change now/
    )
  })

  it('undoing a refund counts again only the payments that refund covered', async () => {
    const earlier = new Date('2026-10-01T00:00:00Z')
    const old = { ...payment('old'), status: 'refunded', refundedAt: earlier }
    const { service, guests } = setup({}, [
      guest('maya', { status: 'declined', refundSentAt: at, payments: [old] }),
    ])
    guests[0].payments.push({
      ...payment('new'),
      guestId: 'maya',
      status: 'refunded',
      refundedAt: at,
    })
    await service.updateGuest('t1', 'maya', { refundSent: false }, caller)
    expect(guests[0].payments.map((p) => p.status)).toEqual(['refunded', 'confirmed'])
  })

  it('confirms no payment for a guest who was turned down', async () => {
    const { service } = setup({}, [
      guest('no', { status: 'declined', payments: [payment('p1', 'reported')] }),
    ])
    await expect(
      service.decidePayment('t1', 'p1', { status: 'confirmed' }, caller)
    ).rejects.toThrow(/was turned down/)
  })

  it('removes a payment the organizer logged instead of putting it back to waiting', async () => {
    const logged = { ...payment('p1'), loggedBy: 'organizer' }
    const { service, guests } = setup({ joinMode: 'accept_first' }, [
      guest('cash', { status: 'approved', payments: [logged] }),
    ])
    await expect(service.decidePayment('t1', 'p1', { status: 'reported' }, caller)).rejects.toThrow(
      /Remove a payment you logged/
    )
    await service.decidePayment('t1', 'p1', { status: 'not_received' }, caller)
    expect(guests[0].payments[0].status).toBe('not_received')
  })

  it('corrects what arrived on a confirmed payment', async () => {
    const { service, guests } = setup({}, [paidGuest('in', { status: 'approved' })])
    await service.decidePayment(
      't1',
      'p-in',
      { status: 'confirmed', receivedPaymentAmount: 450 },
      caller
    )
    expect(guests[0].payments[0]).toMatchObject({ status: 'confirmed', receivedPaymentAmount: 450 })
  })

  it('offers a waitlisted guest the spot that opened, and only them', async () => {
    const { service, writes } = setup({ maxGuests: 2 }, [
      paidGuest('in', { status: 'approved' }),
      guest('wait', { waitlistedAt: at }),
      guest('plain'),
    ])
    await expect(service.updateGuest('t1', 'plain', { offerSpot: true }, caller)).rejects.toThrow(
      /isn’t waiting on the waitlist/
    )
    await service.updateGuest('t1', 'wait', { offerSpot: true }, caller)
    expect(writes[0]).toMatchObject({ status: 'interested', offeredAt: expect.any(Date) })
  })

  it('on an accept-first trip, gives a waitlisted guest the spot by accepting them', async () => {
    const { service } = setup({ joinMode: 'accept_first' }, [guest('wait', { waitlistedAt: at })])
    await expect(service.updateGuest('t1', 'wait', { offerSpot: true }, caller)).rejects.toThrow(
      /Accept wait to give them the spot/
    )
  })
})

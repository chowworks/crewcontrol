import { BadRequestException, ConflictException } from '@nestjs/common'
import type { PrismaService } from '../prisma/prisma.service'
import { TripsService } from './trips.service'

// Trip Control's rules for a guest's spot, on a stand-in database: a spot needs a signature and a confirmed payment,
// first come, first served trips accept on confirmation while spots are left, and turning down a paid guest needs
// the refund ticked.
const caller = { userId: 'u1', isAdmin: false }
const at = new Date('2026-10-20T15:00:00Z')

function guest(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    tripId: 't1',
    userId: null,
    firstName: id,
    lastName: 'X',
    email: `${id}@example.com`,
    phone: '555',
    status: 'interested',
    createdAt: at,
    paymentSentAt: null,
    paymentConfirmedAt: null,
    refundSentAt: null,
    roomId: null,
    roomNote: '',
    agreement: {
      signedAt: at,
      priceCents: 1000,
      installmentCount: 2,
      startDate: 's',
      endDate: 'e',
      refundTerms: 'r',
    },
    ...extra,
  }
}

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
  const prisma = {
    trip: { findFirst: async () => row },
    room: { findFirst: async () => null },
    guest: {
      update: async ({ data }: { data: Record<string, unknown> }) => {
        writes.push(data)
        return {}
      },
    },
  }
  return { service: new TripsService(prisma as unknown as PrismaService), writes }
}

describe('a guest’s spot in Trip Control', () => {
  it('accepts only a guest who signed and whose payment arrived', async () => {
    const { service, writes } = setup({}, [
      guest('unsigned', { agreement: null, paymentConfirmedAt: at }),
      guest('unpaid'),
      guest('ready', { paymentConfirmedAt: at }),
    ])
    await expect(
      service.updateGuest('t1', 'unsigned', { status: 'approved' }, caller)
    ).rejects.toThrow(BadRequestException)
    await expect(
      service.updateGuest('t1', 'unpaid', { status: 'approved' }, caller)
    ).rejects.toThrow(/Confirm unpaid’s payment arrived first/)
    await service.updateGuest('t1', 'ready', { status: 'approved' }, caller)
    expect(writes).toEqual([expect.objectContaining({ status: 'approved' })])
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
    const { service, writes } = setup({ joinMode: 'accept_first' }, [
      guest('in', { status: 'approved', paymentConfirmedAt: at }),
    ])
    await service.updateGuest('t1', 'in', { paymentConfirmed: false }, caller)
    expect(writes[0]).toMatchObject({ status: 'approved', paymentConfirmedAt: null })
  })

  it('keeps the spot limit', async () => {
    const { service } = setup({ maxGuests: 1 }, [
      guest('in', { status: 'approved', paymentConfirmedAt: at }),
      guest('next', { paymentConfirmedAt: at }),
    ])
    await expect(service.updateGuest('t1', 'next', { status: 'approved' }, caller)).rejects.toThrow(
      ConflictException
    )
  })

  it('accepts on a confirmed payment on a first come, first served trip, while spots are left', async () => {
    const { service, writes } = setup({ joinMode: 'first_come', maxGuests: 1 }, [
      guest('first'),
      guest('second'),
    ])
    await service.updateGuest('t1', 'first', { paymentConfirmed: true }, caller)
    expect(writes[0]).toMatchObject({ status: 'approved', paymentConfirmedAt: expect.any(Date) })
  })

  it('confirms a payment on a full first come, first served trip without giving a spot', async () => {
    const { service, writes } = setup({ joinMode: 'first_come', maxGuests: 1 }, [
      guest('first', { status: 'approved', paymentConfirmedAt: at }),
      guest('second'),
    ])
    await service.updateGuest('t1', 'second', { paymentConfirmed: true }, caller)
    expect(writes[0]).toMatchObject({ status: 'interested', paymentConfirmedAt: expect.any(Date) })
  })

  it('turns down a paid guest only with the refund ticked, and frees their room', async () => {
    const { service, writes } = setup({}, [guest('paid', { paymentConfirmedAt: at, roomId: 'r1' })])
    await expect(service.updateGuest('t1', 'paid', { status: 'declined' }, caller)).rejects.toThrow(
      /tick “Refund sent”/
    )
    await service.updateGuest('t1', 'paid', { status: 'declined', refundSent: true }, caller)
    expect(writes[0]).toMatchObject({
      status: 'declined',
      roomId: null,
      refundSentAt: expect.any(Date),
    })
  })

  it('turns down an unpaid guest with no refund to send', async () => {
    const { service, writes } = setup({}, [guest('unpaid')])
    await service.updateGuest('t1', 'unpaid', { status: 'declined' }, caller)
    expect(writes[0]).toMatchObject({ status: 'declined' })
  })

  it('puts a refunded guest back to paying again, and never accepts them on the refunded payment', async () => {
    const { service, writes } = setup({}, [
      guest('back', { status: 'declined', paymentConfirmedAt: at, refundSentAt: at }),
    ])
    await expect(service.updateGuest('t1', 'back', { status: 'approved' }, caller)).rejects.toThrow(
      /was refunded/
    )
    await service.updateGuest('t1', 'back', { status: 'interested' }, caller)
    expect(writes[0]).toMatchObject({
      status: 'interested',
      paymentSentAt: null,
      paymentConfirmedAt: null,
      refundSentAt: null,
    })
  })

  it('lets an organizer move a guest accepted before payments were tracked', async () => {
    const { service, writes } = setup({}, [guest('old', { status: 'approved', agreement: null })])
    await service.updateGuest('t1', 'old', { roomId: null }, caller)
    expect(writes[0]).toMatchObject({ status: 'approved', roomId: null })
  })

  it('will not undo the payment of a guest who has a spot', async () => {
    const { service } = setup({}, [guest('in', { status: 'approved', paymentConfirmedAt: at })])
    await expect(
      service.updateGuest('t1', 'in', { paymentConfirmed: false }, caller)
    ).rejects.toThrow(/Put them back to waiting/)
  })

  it('on an accept-first trip, confirms no payment before the guest is accepted', async () => {
    const { service } = setup({ joinMode: 'accept_first' }, [guest('signed')])
    await expect(
      service.updateGuest('t1', 'signed', { paymentConfirmed: true }, caller)
    ).rejects.toThrow(/Accept signed first/)
  })

  it('records a refund only when turning a guest down', async () => {
    const { service } = setup({}, [guest('paid', { paymentConfirmedAt: at })])
    await expect(service.updateGuest('t1', 'paid', { refundSent: true }, caller)).rejects.toThrow(
      /only when turning a guest down/
    )
  })

  it('on a first come trip, gives a freed spot to the guest whose payment was confirmed first', async () => {
    const later = new Date(at.getTime() + 3600_000)
    const { service, writes } = setup({ joinMode: 'first_come', maxGuests: 2 }, [
      guest('in', { status: 'approved', paymentConfirmedAt: at }),
      guest('early', { paymentConfirmedAt: at }),
      guest('late', { paymentConfirmedAt: later }),
      guest('new'),
    ])
    await expect(service.updateGuest('t1', 'late', { status: 'approved' }, caller)).rejects.toThrow(
      /early’s payment was confirmed first/
    )
    // Confirming another payment while someone is ahead records it without a spot.
    await service.updateGuest('t1', 'new', { paymentConfirmed: true }, caller)
    expect(writes[0]).toMatchObject({ status: 'interested', paymentConfirmedAt: expect.any(Date) })
  })

  it('keeps who gets a spot fixed once guests have signed', async () => {
    const { service } = setup({}, [guest('signed')])
    await expect(service.update('t1', { joinMode: 'first_come' } as never, caller)).rejects.toThrow(
      /can’t change now/
    )
  })
})

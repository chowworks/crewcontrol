import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common'
import type { Caller } from '../auth/caller'
import { runAsSystem } from '../core/tenant-context'
import { money } from '../join/agreement'
import { day } from '../messaging/email-context'
import { EmailsService } from '../messaging/emails.service'
import { isPhotoRef, photoBucket } from '../photos/photo-bucket'
import { PrismaService } from '../prisma/prisma.service'
import { agreementPdf } from './agreement-pdf'
import { recordChange } from './trip-changes'
import { DELETED_KEPT_DAYS, eraseOn } from './trip-mapper'
import type { Guest, OrganizerTrip, Payment, TripPhoto } from './trip-types'
import { TripsService } from './trips.service'

const webUrl = () => (process.env.FRONTEND_URL ?? 'http://localhost:5173').split(',')[0].trim()
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

const STATUS: Record<Payment['status'], string> = {
  reported: 'reported, not yet confirmed',
  confirmed: 'confirmed',
  not_received: 'not received',
  refunded: 'refunded',
}

/**
 * Deleting a trip (issue #2; owner's decision, 2026-10-30): an owner deletes it, and it is hidden from everyone but
 * the admin at once (trips_of_user, and it is unpublished). Each guest who signed is emailed their signed agreement
 * and payments, since the trip's records go with it. For 30 days an owner can restore it from Your trips; then the
 * hourly run erases it for good, photos included.
 */
@Injectable()
export class TripDeletionService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(TripDeletionService.name)
  private timer?: NodeJS.Timeout

  constructor(
    private readonly prisma: PrismaService,
    private readonly trips: TripsService,
    private readonly emails: EmailsService
  ) {}

  onApplicationBootstrap() {
    // Not in tests; otherwise a minute after start, then hourly.
    if (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID) return
    const tick = () =>
      void this.purge().catch((err) => this.logger.error(`Erasing deleted trips failed: ${err}`))
    this.timer = setTimeout(() => {
      tick()
      this.timer = setInterval(tick, HOUR)
      this.timer.unref()
    }, 60 * 1000)
    this.timer.unref()
  }

  onModuleDestroy() {
    clearTimeout(this.timer)
    clearInterval(this.timer)
  }

  /** An owner deletes their trip. Returns when it will be erased. */
  async remove(id: string, caller: Caller): Promise<{ eraseOn: string }> {
    const trip = await this.trips.get(id, caller)
    const me = await this.prisma.tripMember.findUnique({
      where: { tripId_userId: { tripId: id, userId: caller.userId } },
      select: { role: true },
    })
    if (me?.role !== 'owner') throw new ForbiddenException('Only the trip’s owners can delete it.')
    const { isSample } = await this.prisma.trip.findUniqueOrThrow({
      where: { id },
      select: { isSample: true },
    })
    if (isSample) throw new BadRequestException('Sample trips can’t be deleted.')
    // Read before the trip is hidden from its owner.
    const signatures = await this.prisma.agreementSignature.findMany({
      where: { tripId: id },
      select: {
        guestId: true,
        text: true,
        textHash: true,
        templateVersion: true,
        typedName: true,
        signedAt: true,
      },
    })
    const replyTo = (await this.trips.organizerContact(id))?.email || undefined
    const deletedAt = new Date()
    await this.prisma.trip.update({
      where: { id },
      data: { deletedAt, deletedByUserId: caller.userId, published: false },
    })
    await recordChange(this.prisma, id, caller, { what: 'trip_deleted' })
    const erase = eraseOn(deletedAt)
    for (const sig of signatures) {
      const guest = trip.guests.find((g) => g.id === sig.guestId)
      if (guest?.email) await this.sendRecord(trip, guest, sig, erase, replyTo)
    }
    return { eraseOn: erase }
  }

  /** An owner restores a trip they deleted, before it is erased. It comes back unpublished. */
  async restore(id: string, caller: Caller): Promise<void> {
    // A deleted trip is nobody's to read, so this is trusted work, for a trip the caller owns.
    await runAsSystem(async () => {
      const trip = await this.prisma.trip.findFirst({
        where: {
          id,
          deletedAt: { not: null },
          members: { some: { userId: caller.userId, role: 'owner' } },
        },
        select: { id: true },
      })
      if (!trip) throw new NotFoundException('Trip not found')
      await this.prisma.trip.update({
        where: { id },
        data: { deletedAt: null, deletedByUserId: null },
      })
    })
    await recordChange(this.prisma, id, caller, { what: 'trip_restored' })
  }

  /** Erases every trip deleted more than 30 days before `now`, and its photos. Returns how many. */
  async purge(now = new Date()): Promise<number> {
    const due = await runAsSystem(() =>
      this.prisma.trip.findMany({
        where: { deletedAt: { lte: new Date(now.getTime() - DELETED_KEPT_DAYS * DAY) } },
        select: { id: true, photos: true },
      })
    )
    for (const trip of due) {
      // Everything on the trip goes with it (each table's foreign key cascades).
      await runAsSystem(() => this.prisma.trip.delete({ where: { id: trip.id } }))
      const bucket = photoBucket()
      const refs = (trip.photos as unknown as TripPhoto[]).map((p) => p.url).filter(isPhotoRef)
      for (const ref of bucket ? refs : [])
        await bucket!
          .remove(ref)
          .catch((err) => this.logger.error(`A deleted trip's photo stayed: ${ref}: ${err}`))
    }
    return due.length
  }

  /** The guest's own record of the trip: their signed agreement and their payments. Logged, never thrown. */
  private async sendRecord(
    trip: OrganizerTrip,
    guest: Guest,
    sig: {
      text: string
      textHash: string
      templateVersion: string
      typedName: string
      signedAt: Date
    },
    erase: string,
    replyTo?: string
  ): Promise<void> {
    let pdf: Buffer
    try {
      pdf = await agreementPdf({ tripName: trip.name, ...sig })
    } catch (err) {
      this.logger.error(`A deleted trip's agreement PDF failed: ${err}`)
      return
    }
    await this.emails.sendToGuest(
      'trip_deleted',
      { trip: { ...trip, rooms: [] }, me: guest },
      {
        email: guest.email,
        phone: guest.phone,
        paymentMethods: trip.paymentMethods,
        paymentInstructions: trip.paymentInstructions,
        replyTo,
      },
      webUrl(),
      {
        deletion: {
          eraseDate: day(erase.slice(0, 10)),
          agreement: sig.text,
          signedName: sig.typedName,
          signedOn: day(sig.signedAt.toISOString().slice(0, 10)),
          payments: guest.payments.map((p) => ({
            date: day(p.sentOn),
            amount: money(p.receivedPaymentAmount ?? p.guestPaymentAmount),
            // The method's name only: where to send money is shown only to guests who may pay.
            how: p.method.split(' · ')[0],
            status: STATUS[p.status],
          })),
        },
      },
      // The whole agreement as a PDF of its own, exactly as they signed it, with who signed, when, and its SHA-256.
      [
        {
          filename: `signed-agreement-${trip.slug}.pdf`,
          content: pdf,
        },
      ]
    )
  }
}

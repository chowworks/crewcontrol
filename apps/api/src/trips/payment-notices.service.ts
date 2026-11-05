import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common'
import { runAsSystem } from '../core/tenant-context'
import { money } from '../join/agreement'
import { day } from '../messaging/email-context'
import { EmailsService } from '../messaging/emails.service'
import { PrismaService } from '../prisma/prisma.service'
import { toOrganizerTrip } from './trip-mapper'
import { TripsService, withGuests } from './trips.service'
import { forwardTo } from '../receipts/receipts-config'

const webUrl = () => (process.env.FRONTEND_URL ?? 'http://localhost:5173').split(',')[0].trim()
/** How often it looks: the email goes within half a minute of being due. */
const EVERY = 20 * 1000

/**
 * "Payment not received" emails (owner's decisions, 2026-11-05): when an organizer marks a guest's payment not
 * received, `decidePayment` sets `notifyGuestAt` a minute ahead; any other decision in that minute (the toast's Undo)
 * clears it. This run sends each one that's due, with why if the organizer said. Trusted work, since it reads every
 * trip.
 */
@Injectable()
export class PaymentNoticesService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(PaymentNoticesService.name)
  private timer?: NodeJS.Timeout
  private busy = false

  constructor(
    private readonly prisma: PrismaService,
    private readonly trips: TripsService,
    private readonly emails: EmailsService
  ) {}

  onApplicationBootstrap() {
    if (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID) return
    this.timer = setInterval(() => {
      if (this.busy) return
      this.busy = true
      void this.run()
        .catch((err) => this.logger.error(`Payment not received emails failed: ${err}`))
        .finally(() => (this.busy = false))
    }, EVERY)
    this.timer.unref()
  }

  onModuleDestroy() {
    clearInterval(this.timer)
  }

  /** Sends every "Payment not received" email due at `now`. Returns how many went. */
  async run(now = new Date()): Promise<number> {
    return runAsSystem(async () => {
      const due = await this.prisma.payment.findMany({
        where: { notifyGuestAt: { lte: now }, status: 'not_received' },
        select: { id: true, tripId: true, guestId: true },
      })
      let sent = 0
      for (const p of due) {
        // Claimed before sending, so a second run (or a second API) never sends it again.
        const { count } = await this.prisma.payment.updateMany({
          where: { id: p.id, notifyGuestAt: { not: null }, status: 'not_received' },
          data: { notifyGuestAt: null },
        })
        if (count === 0) continue
        const row = await this.prisma.trip.findFirst({
          where: { id: p.tripId, deletedAt: null },
          include: withGuests,
        })
        if (!row) continue
        const trip = toOrganizerTrip(row, 0)
        const guest = trip.guests.find((g) => g.id === p.guestId)
        const payment = guest?.payments.find((x) => x.id === p.id)
        if (!guest?.email || !payment) continue
        const room = guest.roomId
          ? await this.prisma.room.findFirst({
              where: { id: guest.roomId },
              select: { id: true, name: true },
            })
          : null
        await this.emails.sendToGuest(
          'payment_not_received',
          { trip: { ...trip, rooms: room ? [room] : [] }, me: guest },
          {
            email: guest.email,
            phone: guest.phone,
            paymentMethods: trip.paymentMethods,
            paymentInstructions: trip.paymentInstructions,
            receiptsEmail: forwardTo(trip.receipts.address),
            replyTo: (await this.trips.organizerContact(trip.id))?.email || undefined,
          },
          webUrl(),
          {
            payment: {
              amount: money(payment.guestPaymentAmount),
              sentOn: day(payment.sentOn),
              // The method's name only, as the guest picked it.
              method: payment.method.split(' · ')[0],
              reason: payment.decisionNote,
            },
          }
        )
        sent++
      }
      if (sent) this.logger.log(`Sent ${sent} payment not received email${sent === 1 ? '' : 's'}`)
      return sent
    })
  }
}

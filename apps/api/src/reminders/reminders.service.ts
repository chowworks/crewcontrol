import {
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import type { Caller } from '../auth/caller'
import { runAsSystem } from '../core/tenant-context'
import { money } from '../join/agreement'
import { EmailsService } from '../messaging/emails.service'
import { day } from '../messaging/email-context'
import { PrismaService } from '../prisma/prisma.service'
import { toOrganizerTrip } from '../trips/trip-mapper'
import type { Guest, OrganizerTrip, StopUpdatesView, TripReminders } from '../trips/trip-types'
import { TripsService } from '../trips/trips.service'
import { howSoon, isDue, isoDay, remindersFor, type ReminderFor } from './reminder-plan'

const webUrl = () => (process.env.FRONTEND_URL ?? 'http://localhost:5173').split(',')[0].trim()
const HOUR = 60 * 60 * 1000

const withGuests = {
  guests: {
    orderBy: { createdAt: 'asc' },
    include: { agreement: true, payments: true, adjustments: true },
  },
  rooms: { orderBy: { position: 'asc' } },
  reminderSends: { select: { guestId: true, key: true } },
} satisfies Prisma.TripInclude

const nameOf = (g: Pick<Guest, 'firstName' | 'lastName'>) => `${g.firstName} ${g.lastName}`.trim()

/**
 * Scheduled reminders (issue #12): once an hour the API sends what's due (reminder-plan.ts), each reminder once to
 * each guest, as trusted work since it reads every trip. Trip Control shows what goes out when and what went, and the
 * link in each reminder stops them for that guest on that trip.
 */
@Injectable()
export class RemindersService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(RemindersService.name)
  private timer?: NodeJS.Timeout

  constructor(
    private readonly prisma: PrismaService,
    private readonly trips: TripsService,
    private readonly emails: EmailsService
  ) {}

  onApplicationBootstrap() {
    // Not in tests; otherwise a minute after start, then hourly.
    if (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID) return
    const tick = () => void this.run().catch((err) => this.logger.error(`Reminders failed: ${err}`))
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

  /** Sends every reminder due at `now` that a guest hasn't had. Returns how many went. */
  async run(now = new Date()): Promise<number> {
    return runAsSystem(async () => {
      const rows = await this.prisma.trip.findMany({
        // A deleted trip sends nothing more.
        where: { endDate: { gte: isoDay(now) }, deletedAt: null },
        include: withGuests,
      })
      let sent = 0
      for (const row of rows) {
        const trip = toOrganizerTrip(row, 0)
        const raw = new Map(row.guests.map((g) => [g.id, g]))
        const had = new Set(row.reminderSends.map((s) => `${s.guestId} ${s.key}`))
        const due = remindersFor(trip, trip.guests, (g) =>
          Boolean(raw.get(g.id)?.updatesStoppedAt)
        ).filter((x) => isDue(x.reminder, now) && !had.has(`${x.guest.id} ${x.reminder.key}`))
        if (due.length === 0) continue
        const replyTo = (await this.trips.organizerContact(trip.id))?.email || undefined
        for (const x of due) {
          if (!(await this.claim(trip, x))) continue
          await this.send(trip, x, raw.get(x.guest.id)!.updatesToken, replyTo, now)
          sent++
        }
      }
      if (sent) this.logger.log(`Sent ${sent} reminder${sent === 1 ? '' : 's'}`)
      return sent
    })
  }

  /** Writes the sent line first, so a second run (or a second API) never sends it again. False if it's there. */
  private async claim(trip: OrganizerTrip, { guest, reminder: r }: ReminderFor): Promise<boolean> {
    try {
      await this.prisma.reminderSend.create({
        data: {
          tripId: trip.id,
          guestId: guest.id,
          key: r.key,
          date: r.date,
          label: r.label,
          paymentDue: r.kind === 'payment',
        },
      })
      return true
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return false
      throw err
    }
  }

  private async send(
    trip: OrganizerTrip,
    { guest: g, reminder: r, owedCents }: ReminderFor,
    token: string,
    replyTo: string | undefined,
    now: Date
  ): Promise<void> {
    const room = g.roomId ? await this.prisma.room.findFirst({ where: { id: g.roomId } }) : null
    await this.emails.sendToGuest(
      r.kind === 'payment' ? 'payment_reminder' : 'date_reminder',
      { trip: { ...trip, rooms: room ? [{ id: room.id, name: room.name }] : [] }, me: g },
      {
        email: g.email,
        phone: g.phone,
        paymentMethods: trip.paymentMethods,
        paymentInstructions: trip.paymentInstructions,
        replyTo,
      },
      webUrl(),
      {
        reminder: {
          label: r.label,
          date: day(r.date),
          when: howSoon(r.date, isoDay(now)),
          paymentDue: r.kind === 'payment',
          amountDue: r.kind === 'payment' ? money(owedCents) : '',
        },
        stopLink: `${webUrl()}/stop/${token}`,
      }
    )
  }

  /** Trip Control's Reminders section: what goes out when and to whom, what went, and who stopped them. */
  async forTrip(id: string, caller: Caller, now = new Date()): Promise<TripReminders> {
    const trip = await this.trips.get(id, caller)
    const today = isoDay(now)
    const stoppedIds = new Set(
      (
        await this.prisma.guest.findMany({
          where: { tripId: id, updatesStoppedAt: { not: null } },
          select: { id: true },
        })
      ).map((g) => g.id)
    )
    const sends = await this.prisma.reminderSend.findMany({
      where: { tripId: id },
      orderBy: { sentAt: 'asc' },
    })
    const byId = new Map(trip.guests.map((g) => [g.id, g]))
    const sent = new Map<string, TripReminders['sent'][number]>()
    for (const s of sends) {
      const line = sent.get(s.key) ?? {
        date: s.date,
        label: s.label,
        paymentDue: s.paymentDue,
        sentAt: s.sentAt.toISOString(),
        to: [],
      }
      const g = byId.get(s.guestId)
      if (g) line.to.push(nameOf(g))
      sent.set(s.key, line)
    }
    const had = new Set(sends.map((s) => `${s.guestId} ${s.key}`))
    // What's still to go, one line per reminder: guests whose plans have the same date share it.
    const upcoming = new Map<string, TripReminders['upcoming'][number]>()
    for (const { reminder: r, guest } of remindersFor(trip, trip.guests, (g) =>
      stoppedIds.has(g.id)
    )) {
      if (r.date < today || had.has(`${guest.id} ${r.key}`)) continue
      const line = upcoming.get(r.key) ?? {
        date: r.date,
        label: r.label,
        paymentDue: r.kind === 'payment',
        sendOn: r.sendOn,
        to: [],
      }
      line.to.push(nameOf(guest))
      upcoming.set(r.key, line)
    }
    return {
      upcoming: [...upcoming.values()],
      sent: [...sent.values()].sort((a, b) => b.sentAt.localeCompare(a.sentAt)),
      stopped: trip.guests.filter((g) => stoppedIds.has(g.id)).map(nameOf),
    }
  }

  /** The "Stop updates for this trip" page: whose link it is. Trusted work, since the link names no trip. */
  async stopView(token: string): Promise<StopUpdatesView> {
    const g = await runAsSystem(() =>
      this.prisma.guest.findUnique({
        where: { updatesToken: token },
        select: { firstName: true, updatesStoppedAt: true, trip: { select: { name: true } } },
      })
    )
    if (!g) throw new NotFoundException('This link doesn’t work any more')
    return { tripName: g.trip.name, firstName: g.firstName, stopped: g.updatesStoppedAt !== null }
  }

  /** Stops reminders for the guest whose link it is, or starts them again. */
  async setStopped(token: string, stopped: boolean): Promise<StopUpdatesView> {
    await this.stopView(token)
    await runAsSystem(() =>
      this.prisma.guest.update({
        where: { updatesToken: token },
        data: { updatesStoppedAt: stopped ? new Date() : null },
      })
    )
    return this.stopView(token)
  }
}

import {
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import type { Caller } from '../auth/caller'
import { ClerkService } from '../auth/clerk.service'
import { runAsSystem } from '../core/tenant-context'
import { money } from '../join/agreement'
import { EmailsService } from '../messaging/emails.service'
import { day } from '../messaging/email-context'
import { PrismaService } from '../prisma/prisma.service'
import { toOrganizerTrip } from '../trips/trip-mapper'
import type { Guest, OrganizerTrip, StopUpdatesView, TripReminders } from '../trips/trip-types'
import { TripsService } from '../trips/trips.service'
import {
  howSoon,
  isDue,
  isoDay,
  remindersFor,
  vendorReminder,
  type ReminderFor,
} from './reminder-plan'
import { forwardTo } from '../receipts/receipts-config'

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
    private readonly emails: EmailsService,
    private readonly clerk: ClerkService
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

  /** Sends every reminder due at `now` that a guest (or, for a vendor payment, an organizer) hasn't had. */
  async run(now = new Date()): Promise<number> {
    return (await this.runGuests(now)) + (await this.runVendors(now))
  }

  /** Sends every guest reminder due at `now` that a guest hasn't had. Returns how many went. */
  private async runGuests(now: Date): Promise<number> {
    return runAsSystem(async () => {
      const rows = await this.prisma.trip.findMany({
        // A deleted trip sends nothing more, and a sample trip never sends (owner's decision, 2026-11-28).
        where: { endDate: { gte: isoDay(now) }, deletedAt: null, isSample: false },
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

  /**
   * Vendor payment reminders (issue #116): a week before an unpaid expense is due and the morning it's due, to each
   * owner and organizer of its trip. The mark on the expense is written first, so a second run (or a second API)
   * never sends it again. Returns how many emails went.
   */
  private async runVendors(now: Date): Promise<number> {
    return runAsSystem(async () => {
      const rows = await this.prisma.expense.findMany({
        where: {
          paidOn: null,
          dueOn: { gte: isoDay(now) },
          trip: { deletedAt: null, isSample: false, members: { some: {} } },
        },
        include: {
          trip: { select: { id: true, name: true, members: { select: { userId: true } } } },
        },
        orderBy: [{ dueOn: 'asc' }, { createdAt: 'asc' }],
      })
      let sent = 0
      for (const e of rows) {
        const stage = vendorReminder(e, now)
        if (!stage || !e.dueOn) continue
        const mark = stage === 'early' ? 'remindedEarlyFor' : 'remindedDueFor'
        const { count } = await this.prisma.expense.updateMany({
          where: {
            id: e.id,
            paidOn: null,
            dueOn: e.dueOn,
            OR: [{ [mark]: null }, { [mark]: { not: e.dueOn } }],
          },
          data: { [mark]: e.dueOn },
        })
        if (count === 0) continue
        const people = await this.clerk.people(e.trip.members.map((m) => m.userId))
        for (const person of people.values()) {
          if (!person.email) continue
          const ok = await this.emails.sendVendorReminder(
            {
              firstName: person.name.split(' ')[0] || 'there',
              tripName: e.trip.name,
              payee: e.payee,
              description: e.description,
              amount: money(e.amountCents),
              dueDate: day(e.dueOn),
              when: howSoon(e.dueOn, isoDay(now)),
              dueToday: stage === 'due',
              link: `${webUrl()}/organize/${e.trip.id}/control`,
            },
            person.email,
            e.trip.id
          )
          if (ok) sent++
        }
      }
      if (sent) this.logger.log(`Sent ${sent} vendor payment reminder${sent === 1 ? '' : 's'}`)
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
        receiptsEmail: forwardTo(trip.receipts.address),
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

  /**
   * The "Stop updates for this trip" page: whose link it is, a guest's or (issue #77) someone's on the Interested list.
   * Trusted work, since the link names no trip.
   */
  async stopView(token: string): Promise<StopUpdatesView> {
    const g = await runAsSystem(() =>
      this.prisma.guest.findUnique({
        where: { updatesToken: token },
        select: { firstName: true, updatesStoppedAt: true, trip: { select: { name: true } } },
      })
    )
    const who =
      g ??
      (await runAsSystem(() =>
        this.prisma.tripInterest.findUnique({
          where: { updatesToken: token },
          select: { firstName: true, updatesStoppedAt: true, trip: { select: { name: true } } },
        })
      ))
    if (!who) throw new NotFoundException('This link doesn’t work any more')
    return {
      tripName: who.trip.name,
      firstName: who.firstName,
      stopped: who.updatesStoppedAt !== null,
      interested: !g,
    }
  }

  /** Stops reminders and announcement emails for whoever's link it is, or starts them again. */
  async setStopped(token: string, stopped: boolean): Promise<StopUpdatesView> {
    await this.stopView(token)
    const data = { updatesStoppedAt: stopped ? new Date() : null }
    await runAsSystem(async () => {
      const { count } = await this.prisma.guest.updateMany({ where: { updatesToken: token }, data })
      if (count === 0)
        await this.prisma.tripInterest.updateMany({ where: { updatesToken: token }, data })
    })
    return this.stopView(token)
  }
}

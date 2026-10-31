import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common'
import { ClerkService } from '../auth/clerk.service'
import { runAsSystem } from '../core/tenant-context'
import { EmailsService } from '../messaging/emails.service'
import { PrismaService } from '../prisma/prisma.service'
import { toOrganizerTrip } from '../trips/trip-mapper'
import { withGuests } from '../trips/trips.service'
import { alertItems, summary, type AlertItem } from './alert-items'

const webUrl = () => (process.env.FRONTEND_URL ?? 'http://localhost:5173').split(',')[0].trim()
const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
/** How often the run looks: often enough that the first alert after a quiet spell goes out within minutes. */
const EVERY = 5 * MINUTE
/** The sent-email log keeps 30 days (owner's decision, 2026-10-31). */
const KEEP_DAYS = 30

type Item = AlertItem & { tripId: string; tripName: string }

/**
 * Organizer alerts (owner's decisions, 2026-10-31): every five minutes the API looks at every trip's Actions, and
 * emails each owner and organizer what's new for them since their last alert, all their trips in one email. After one
 * goes, the next waits the hours set in System Settings (alertWindowHours), so what comes up meanwhile goes together.
 * Each action is named once (ActionAlert); its row goes when the action is done, so it can come back if it happens
 * again. Trusted work, since it reads every trip. It also clears the sent-email log after 30 days.
 */
@Injectable()
export class AlertsService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(AlertsService.name)
  private timer?: NodeJS.Timeout

  constructor(
    private readonly prisma: PrismaService,
    private readonly clerk: ClerkService,
    private readonly emails: EmailsService
  ) {}

  onApplicationBootstrap() {
    // Not in tests; otherwise a minute after start, then every five minutes.
    if (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID) return
    const tick = () => void this.run().catch((err) => this.logger.error(`Alerts failed: ${err}`))
    this.timer = setTimeout(() => {
      tick()
      this.timer = setInterval(tick, EVERY)
      this.timer.unref()
    }, MINUTE)
    this.timer.unref()
  }

  onModuleDestroy() {
    clearTimeout(this.timer)
    clearInterval(this.timer)
  }

  /** Sends every alert due at `now`. Returns how many went. */
  async run(now = new Date()): Promise<number> {
    return runAsSystem(async () => {
      await this.prisma.emailSend.deleteMany({
        where: { sentAt: { lt: new Date(now.getTime() - KEEP_DAYS * 24 * HOUR) } },
      })
      const settings = await this.prisma.systemSettings.findUnique({ where: { id: 1 } })
      const windowHours = settings?.alertWindowHours ?? 4
      const rows = await this.prisma.trip.findMany({
        where: { deletedAt: null, members: { some: {} } },
        include: { ...withGuests, members: { select: { userId: true } } },
      })
      // What needs each person now, on every trip they work on.
      const open = new Map<string, Item[]>()
      for (const row of rows) {
        const items = alertItems(toOrganizerTrip(row, settings?.waitlistBufferPercent ?? 10))
        for (const m of row.members)
          open.set(m.userId, [
            ...(open.get(m.userId) ?? []),
            ...items.map((i) => ({ ...i, tripId: row.id, tripName: row.name })),
          ])
      }
      const id = (userId: string, i: { tripId: string; key: string }) =>
        `${userId} ${i.tripId} ${i.key}`
      const current = new Set([...open].flatMap(([u, items]) => items.map((i) => id(u, i))))
      // Done since (or no longer theirs): forget it, so it's new again if it comes back.
      const told = await this.prisma.actionAlert.findMany()
      const done = told.filter((t) => !current.has(id(t.userId, t)))
      if (done.length)
        await this.prisma.actionAlert.deleteMany({ where: { id: { in: done.map((t) => t.id) } } })
      const had = new Set(told.map((t) => id(t.userId, t)))
      const fresh = [...open]
        .map(([userId, items]) => ({ userId, items: items.filter((i) => !had.has(id(userId, i))) }))
        .filter((x) => x.items.length > 0)
      if (fresh.length === 0) return 0

      const people = await this.clerk.people(fresh.map((x) => x.userId))
      const since = new Date(now.getTime() - windowHours * HOUR)
      let sent = 0
      for (const { userId, items } of fresh) {
        const person = people.get(userId)
        if (!person?.email) continue
        const to = person.email.trim().toLowerCase()
        // Emailed within the window (sent or not, so a failing send waits too): this waits for the next one.
        const recent = await this.prisma.emailSend.findFirst({
          where: { kind: 'organizer_actions', toAddress: to, sentAt: { gt: since } },
          select: { id: true },
        })
        if (recent) continue
        // Claimed before sending, so a second run (or a second API) never sends the same thing again.
        const { count } = await this.prisma.actionAlert.createMany({
          data: items.map((i) => ({ userId, tripId: i.tripId, key: i.key, alertedAt: now })),
          skipDuplicates: true,
        })
        if (count === 0) continue
        const ok = await this.emails.sendAlert(this.alert(person.name, items, windowHours), to)
        if (ok) sent++
        // Not sent: let the next alert, after the window, name them again.
        else
          await this.prisma.actionAlert.deleteMany({
            where: {
              userId,
              alertedAt: now,
              OR: items.map((i) => ({ tripId: i.tripId, key: i.key })),
            },
          })
      }
      if (sent) this.logger.log(`Sent ${sent} organizer alert${sent === 1 ? '' : 's'}`)
      return sent
    })
  }

  private alert(name: string, items: Item[], windowHours: number) {
    const trips = new Map<string, Item[]>()
    for (const i of items) trips.set(i.tripId, [...(trips.get(i.tripId) ?? []), i])
    return {
      firstName: name.split(' ')[0] || 'there',
      count: items.length,
      single: items.length === 1,
      trips: [...trips].map(([tripId, list]) => ({
        name: list[0].tripName,
        summary: summary(list),
        link: `${webUrl()}/organize/${tripId}/control`,
      })),
      link: `${webUrl()}/organize`,
      windowHours,
    }
  }
}

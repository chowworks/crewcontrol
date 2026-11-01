import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import type { Caller } from '../auth/caller'
import { ClerkService } from '../auth/clerk.service'
import { runAsPublic } from '../core/tenant-context'
import { owed } from '../join/guest-pay'
import { EmailsService } from '../messaging/emails.service'
import { PrismaService } from '../prisma/prisma.service'
import type {
  AnnouncementAudience,
  AnnouncementInput,
  AnnouncementView,
  Guest,
  GuestAnnouncements,
  OrganizerTrip,
  TripAnnouncements,
} from '../trips/trip-types'
import { recordChange, snippet } from '../trips/trip-changes'
import { TripsService } from '../trips/trips.service'

const webUrl = () => (process.env.FRONTEND_URL ?? 'http://localhost:5173').split(',')[0].trim()

const AUDIENCES: AnnouncementAudience[] = ['accepted', 'owing']

/** The guests a post for `audience` goes to now: accepted guests only (owner's decision, 2026-10-29). */
export function audienceOf(trip: OrganizerTrip, audience: AnnouncementAudience): Guest[] {
  return trip.guests.filter(
    (g) =>
      g.status === 'approved' &&
      (audience === 'accepted' || (g.terms !== null && owed(g.terms).left > 0))
  )
}

/** "Monique H.": how a guest's reply is signed, as the trip page names accepted guests. */
export const shortName = (first: string, last: string) =>
  [first.trim(), last.trim() ? `${last.trim()[0]}.` : ''].filter(Boolean).join(' ')

const withReplies = {
  replies: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.AnnouncementInclude

type Row = Prisma.AnnouncementGetPayload<{ include: typeof withReplies }>

/** Pinned first, then newest first. */
const byPinThenNewest = (a: Row, b: Row) =>
  Number(b.pinned) - Number(a.pinned) || b.createdAt.getTime() - a.createdAt.getTime()

function toView(row: Row, caller: Caller): AnnouncementView {
  return {
    id: row.id,
    authorName: row.authorName,
    body: row.body,
    audience: row.audience as AnnouncementAudience,
    pinned: row.pinned,
    createdAt: row.createdAt.toISOString(),
    replies: row.replies.map((r) => ({
      id: r.id,
      authorName: r.authorName,
      fromOrganizer: r.guestId === null,
      body: r.body,
      createdAt: r.createdAt.toISOString(),
      mine: r.authorUserId === caller.userId,
    })),
  }
}

/**
 * Announcements (issue #12): an organizer posts to the guests who joined, optionally by email as well, and the guests
 * it's for reply under it (owner's decision, 2026-10-29). Organizers read and write as members of the trip; guests as
 * themselves, whom row-level security keeps to the posts for them (migration 20261029090000_announcements).
 */
@Injectable()
export class AnnouncementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly trips: TripsService,
    private readonly clerk: ClerkService,
    private readonly emails: EmailsService
  ) {}

  /** Trip Control's Announcements: every post with its replies, and who each audience reaches now. */
  async forTrip(id: string, caller: Caller): Promise<TripAnnouncements> {
    const trip = await this.trips.get(id, caller)
    const stopped = await this.stoppedIds(id)
    const rows = await this.prisma.announcement.findMany({
      where: { tripId: id },
      include: { ...withReplies, recipients: { select: { emailedAt: true } } },
    })
    const audiences = Object.fromEntries(
      AUDIENCES.map((a) => {
        const guests = audienceOf(trip, a)
        return [
          a,
          { guests: guests.length, stopped: guests.filter((g) => stopped.has(g.id)).length },
        ]
      })
    ) as TripAnnouncements['audiences']
    return {
      announcements: rows.sort(byPinThenNewest).map((r) => ({
        ...toView(r, caller),
        sentTo: r.recipients.length,
        emailedTo: r.recipients.filter((x) => x.emailedAt).length,
      })),
      audiences,
    }
  }

  /** Posts it to the audience as it is now, and emails each of them who hasn't stopped updates when asked to. */
  async post(id: string, input: AnnouncementInput, caller: Caller): Promise<TripAnnouncements> {
    const trip = await this.trips.get(id, caller)
    const to = audienceOf(trip, input.audience)
    if (to.length === 0) throw new BadRequestException('Nobody is in that group yet')
    const me = await this.clerk.contact(caller.userId)
    const from = me.name.split(' ')[0] || trip.organizerName || 'The organizer'
    const row = await this.prisma.announcement.create({
      data: {
        tripId: id,
        authorUserId: caller.userId,
        authorName: from,
        body: input.body,
        audience: input.audience,
        pinned: input.pinned,
        emailed: input.email,
        recipients: { create: to.map((g) => ({ guestId: g.id })) },
      },
    })
    await recordChange(this.prisma, id, caller, {
      what: 'announcement',
      action: 'posted',
      text: snippet(input.body),
    })
    if (input.email) {
      const tokens = new Map(
        (
          await this.prisma.guest.findMany({
            where: { tripId: id, updatesStoppedAt: null },
            select: { id: true, updatesToken: true },
          })
        ).map((g) => [g.id, g.updatesToken])
      )
      for (const g of to) {
        const token = tokens.get(g.id)
        if (!token || !g.email) continue
        await this.emails.sendToGuest(
          'announcement',
          { trip: { ...trip, rooms: [] }, me: g },
          {
            email: g.email,
            phone: g.phone,
            paymentMethods: trip.paymentMethods,
            paymentInstructions: trip.paymentInstructions,
            replyTo: me.email || undefined,
          },
          webUrl(),
          { announcement: { from, body: input.body }, stopLink: `${webUrl()}/stop/${token}` }
        )
        await this.prisma.announcementRecipient.update({
          where: { announcementId_guestId: { announcementId: row.id, guestId: g.id } },
          data: { emailedAt: new Date() },
        })
      }
    }
    return this.forTrip(id, caller)
  }

  async setPinned(id: string, announcementId: string, pinned: boolean, caller: Caller) {
    await this.trips.get(id, caller)
    const { count } = await this.prisma.announcement.updateMany({
      where: { id: announcementId, tripId: id },
      data: { pinned },
    })
    if (count === 0) throw new NotFoundException('Announcement not found')
    return this.forTrip(id, caller)
  }

  /** Removes the post and its replies. Its emails have gone; this only takes it off the trip. */
  async remove(id: string, announcementId: string, caller: Caller) {
    await this.trips.get(id, caller)
    const row = await this.prisma.announcement.findFirst({
      where: { id: announcementId, tripId: id },
      select: { body: true },
    })
    const { count } = await this.prisma.announcement.deleteMany({
      where: { id: announcementId, tripId: id },
    })
    if (count && row)
      await recordChange(this.prisma, id, caller, {
        what: 'announcement',
        action: 'deleted',
        text: snippet(row.body),
      })
    return this.forTrip(id, caller)
  }

  /** An organizer's reply, signed with their first name. */
  async organizerReply(id: string, announcementId: string, body: string, caller: Caller) {
    const trip = await this.trips.get(id, caller)
    await this.findPost(id, announcementId)
    const me = await this.clerk.contact(caller.userId)
    await this.prisma.announcementReply.create({
      data: {
        announcementId,
        tripId: id,
        authorUserId: caller.userId,
        authorName: me.name.split(' ')[0] || trip.organizerName || 'The organizer',
        body,
      },
    })
    return this.forTrip(id, caller)
  }

  /** An organizer removes any reply on their trip. */
  async removeReplyAsOrganizer(id: string, replyId: string, caller: Caller) {
    await this.trips.get(id, caller)
    await this.prisma.announcementReply.deleteMany({ where: { id: replyId, tripId: id } })
    return this.forTrip(id, caller)
  }

  /**
   * The join page's Announcements: none until the caller is accepted, then the posts for everyone on the trip and the
   * ones that went to them. Row-level security allows the same, but an organizer who also joined reads every post as
   * a member, so the page picks them here too.
   */
  async forGuest(slug: string, caller: Caller): Promise<GuestAnnouncements> {
    const { tripId, guests } = await this.myGuests(slug, caller)
    const accepted = guests.filter((g) => g.status === 'approved').map((g) => g.id)
    if (accepted.length === 0) return { announcements: [], canReply: false }
    const rows = await this.prisma.announcement.findMany({
      where: {
        tripId,
        OR: [{ audience: 'accepted' }, { recipients: { some: { guestId: { in: accepted } } } }],
      },
      include: withReplies,
    })
    return {
      announcements: rows.sort(byPinThenNewest).map((r) => toView(r, caller)),
      canReply: true,
    }
  }

  /** A guest's reply under a post for them, signed as their own place on the trip (or one they look after). */
  async guestReply(slug: string, announcementId: string, body: string, caller: Caller) {
    const { tripId, guests } = await this.myGuests(slug, caller)
    const on = guests.filter((g) => g.status === 'approved')
    const as = on.find((g) => g.userId === caller.userId) ?? on[0]
    if (!as) throw new NotFoundException('Announcement not found')
    if (!(await this.forGuest(slug, caller)).announcements.some((a) => a.id === announcementId))
      throw new NotFoundException('Announcement not found')
    await this.prisma.announcementReply.create({
      data: {
        announcementId,
        tripId,
        guestId: as.id,
        authorUserId: caller.userId,
        authorName: shortName(as.firstName, as.lastName),
        body,
      },
    })
    return this.forGuest(slug, caller)
  }

  /** A guest removes a reply of their own. */
  async removeOwnReply(slug: string, replyId: string, caller: Caller) {
    const { tripId } = await this.myGuests(slug, caller)
    await this.prisma.announcementReply.deleteMany({
      where: { id: replyId, tripId, authorUserId: caller.userId },
    })
    return this.forGuest(slug, caller)
  }

  private async findPost(tripId: string, announcementId: string) {
    const post = await this.prisma.announcement.findFirst({
      where: { id: announcementId, tripId },
      select: { id: true },
    })
    if (!post) throw new NotFoundException('Announcement not found')
  }

  /** The trip (read as its public page) and the caller's own places on it, or not found. */
  private async myGuests(slug: string, caller: Caller) {
    const trip = await runAsPublic(() =>
      this.prisma.trip.findUnique({ where: { slug }, select: { id: true } })
    )
    if (!trip) throw new NotFoundException('Trip not found')
    const guests = await this.prisma.guest.findMany({
      where: {
        tripId: trip.id,
        OR: [{ userId: caller.userId }, { managedByUserId: caller.userId }],
      },
      select: { id: true, userId: true, status: true, firstName: true, lastName: true },
      orderBy: { createdAt: 'asc' },
    })
    if (guests.length === 0) throw new NotFoundException('Trip not found')
    return { tripId: trip.id, guests }
  }

  private async stoppedIds(tripId: string): Promise<Set<string>> {
    const rows = await this.prisma.guest.findMany({
      where: { tripId, updatesStoppedAt: { not: null } },
      select: { id: true },
    })
    return new Set(rows.map((g) => g.id))
  }
}

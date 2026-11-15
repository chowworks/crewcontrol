import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type { Caller } from '../auth/caller'
import { ClerkService } from '../auth/clerk.service'
import { runAsPublic } from '../core/tenant-context'
import { EmailsService } from '../messaging/emails.service'
import { PrismaService } from '../prisma/prisma.service'
import type {
  ChangeCloseInput,
  ChangeRequestStatus,
  MyChangeRequests,
  TripChangeRequest,
} from '../trips/trip-types'
import { TripsService } from '../trips/trips.service'

const webUrl = () => (process.env.FRONTEND_URL ?? 'http://localhost:5173').split(',')[0].trim()

/**
 * Trip change requests (issue #82; owner's decisions, 2026-11-15). An accepted guest asks the organizers for a change
 * to their trip in their own words, from the trip page. Always private, never on the trip page. Each open request is
 * one of Trip Control's Actions (and in the organizers' action alert emails); organizers keep notes on it that the
 * guest never sees, and close it as done or not possible with a message, which is emailed to the guest. Making the
 * change itself stays with the organizer, on the screens that already do it. Organizers work as members of the trip;
 * a guest as themselves, whom row-level security keeps to their own requests and never to the notes (migration
 * 20261115010000_trip_change_requests).
 */
@Injectable()
export class ChangesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly trips: TripsService,
    private readonly clerk: ClerkService,
    private readonly emails: EmailsService
  ) {}

  /** Trip Control's requests: the open ones oldest first, then the closed ones newest first, each with its notes. */
  async forTrip(id: string, caller: Caller): Promise<TripChangeRequest[]> {
    await this.trips.get(id, caller)
    const rows = await this.prisma.tripChangeRequest.findMany({
      where: { tripId: id },
      include: {
        guest: { select: { firstName: true, lastName: true } },
        notes: { orderBy: { createdAt: 'asc' } },
      },
      orderBy: { createdAt: 'asc' },
    })
    const view = (r: (typeof rows)[number]): TripChangeRequest => ({
      id: r.id,
      guestId: r.guestId,
      guestName: `${r.guest.firstName} ${r.guest.lastName}`.trim(),
      requesterName: r.requesterName,
      request: r.request,
      status: r.status as ChangeRequestStatus,
      reply: r.reply,
      closedByName: r.closedByName,
      createdAt: r.createdAt.toISOString(),
      closedAt: r.closedAt?.toISOString() ?? null,
      notes: r.notes.map((n) => ({
        id: n.id,
        text: n.text,
        authorName: n.authorName,
        createdAt: n.createdAt.toISOString(),
      })),
    })
    const closed = rows.filter((r) => r.status !== 'open').reverse()
    return [...rows.filter((r) => r.status === 'open'), ...closed].map(view)
  }

  /** Adds an organizer's note to a request, open or closed. The guest is not told. */
  async addNote(
    id: string,
    requestId: string,
    text: string,
    caller: Caller
  ): Promise<TripChangeRequest[]> {
    await this.trips.get(id, caller)
    await this.find(id, requestId)
    await this.prisma.tripChangeNote.create({
      data: {
        tripId: id,
        requestId,
        authorUserId: caller.userId,
        authorName: await this.firstName(caller),
        text,
      },
    })
    return this.forTrip(id, caller)
  }

  /** Closes an open request as done or not possible, and emails the guest the organizer's message. */
  async close(
    id: string,
    requestId: string,
    input: ChangeCloseInput,
    caller: Caller
  ): Promise<TripChangeRequest[]> {
    const trip = await this.trips.get(id, caller)
    const row = await this.find(id, requestId)
    const me = await this.clerk.contact(caller.userId)
    // Only an open one, so two organizers closing it at once can't both email the guest.
    const { count } = await this.prisma.tripChangeRequest.updateMany({
      where: { id: row.id, tripId: id, status: 'open' },
      data: {
        status: input.status,
        reply: input.reply || null,
        closedByName: me.name.split(' ')[0] || trip.organizerName || 'An organizer',
        closedAt: new Date(),
      },
    })
    if (!count) throw new BadRequestException('That request is already closed')
    // Sent after the reply; a failure is logged (sendChange).
    if (row.requesterEmail)
      void this.emails.sendChange(
        {
          tripName: trip.name,
          firstName: row.requesterName.split(' ')[0] || 'there',
          request: row.request,
          reply: input.reply,
          done: input.status === 'done',
          link: `${webUrl()}/t/${trip.slug}`,
        },
        row.requesterEmail,
        me.email || undefined,
        id
      )
    return this.forTrip(id, caller)
  }

  /** The trip page's requests for the signed-in caller: whether they can ask, and the ones they asked, newest first. */
  async mine(slug: string, caller: Caller): Promise<MyChangeRequests> {
    const trip = await this.published(slug)
    const [guest, rows] = await Promise.all([
      this.acceptedGuest(trip.id, caller),
      this.prisma.tripChangeRequest.findMany({
        where: { tripId: trip.id, userId: caller.userId },
        orderBy: { createdAt: 'desc' },
      }),
    ])
    return {
      canAsk: guest !== null,
      requests: rows.map((r) => ({
        id: r.id,
        request: r.request,
        status: r.status as ChangeRequestStatus,
        reply: r.reply,
        createdAt: r.createdAt.toISOString(),
        closedAt: r.closedAt?.toISOString() ?? null,
      })),
    }
  }

  /** Asks the organizers for a change: only someone accepted on the trip (themselves, or a traveler they look after). */
  async ask(slug: string, request: string, caller: Caller): Promise<MyChangeRequests> {
    const trip = await this.published(slug)
    const guest = await this.acceptedGuest(trip.id, caller)
    if (!guest)
      throw new ForbiddenException('Only guests accepted on the trip can request a change')
    const me = await this.clerk.contact(caller.userId)
    await this.prisma.tripChangeRequest.create({
      data: {
        tripId: trip.id,
        guestId: guest.id,
        userId: caller.userId,
        requesterName: me.name || `${guest.firstName} ${guest.lastName}`.trim(),
        requesterEmail: me.email || null,
        request,
      },
    })
    return this.mine(slug, caller)
  }

  /** The caller's own accepted place on a trip, or else the first accepted traveler they look after. */
  private async acceptedGuest(tripId: string, caller: Caller) {
    const rows = await this.prisma.guest.findMany({
      where: {
        tripId,
        status: 'approved',
        OR: [{ userId: caller.userId }, { managedByUserId: caller.userId }],
      },
      select: { id: true, userId: true, firstName: true, lastName: true },
      orderBy: { createdAt: 'asc' },
    })
    return rows.find((r) => r.userId === caller.userId) ?? rows[0] ?? null
  }

  private async find(tripId: string, requestId: string) {
    const row = await this.prisma.tripChangeRequest.findFirst({ where: { id: requestId, tripId } })
    if (!row) throw new NotFoundException('Request not found')
    return row
  }

  private async firstName(caller: Caller): Promise<string> {
    return (await this.clerk.contact(caller.userId)).name.split(' ')[0] || 'An organizer'
  }

  /** A published trip by its link, read as its public page, or not found. */
  private async published(slug: string) {
    const trip = await runAsPublic(() =>
      this.prisma.trip.findUnique({ where: { slug }, select: { id: true, published: true } })
    )
    if (!trip?.published) throw new NotFoundException('Trip not found')
    return trip
  }
}

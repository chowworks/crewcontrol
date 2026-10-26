import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import type { Caller } from '../auth/caller'
import { runAsSystem } from '../core/tenant-context'
import { withCoverLink, withPhotoLinks } from '../photos/photo-bucket'
import { PrismaService, rlsActive } from '../prisma/prisma.service'
import { agreementPreview } from '../join/agreement'
import { sendText } from '../join/send-text'
import {
  toOrganizerTrip,
  toPublicTrip,
  toSignedAgreement,
  toTripSummary,
  type PublicGuestRow,
} from './trip-mapper'
import type {
  AgreementPreview,
  BedType,
  GuestEvent,
  Guest,
  GuestUpdate,
  OrganizerTrip,
  PaymentDecision,
  PaymentLog,
  PublicTrip,
  SignedAgreement,
  SystemSettings,
  TripInput,
  TripLogEntry,
  TripRoom,
  TripSummary,
} from './trip-types'
import { makeSlug } from './slug'

/** A chosen trip link that another trip already has reads as a 409 the editor can show as it is. */
async function uniqueSlug<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write()
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')
      throw new ConflictException('That trip link is taken. Try another.')
    throw err
  }
}

const withGuests = {
  guests: { orderBy: { createdAt: 'asc' }, include: { agreement: true, payments: true } },
  rooms: { orderBy: { position: 'asc' } },
} satisfies Prisma.TripInclude

function data(input: TripInput) {
  return {
    ...input,
    photos: input.photos as unknown as Prisma.InputJsonValue,
    highlights: input.highlights as unknown as Prisma.InputJsonValue,
    keyDates: input.keyDates as unknown as Prisma.InputJsonValue,
    paymentMethods: input.paymentMethods as unknown as Prisma.InputJsonValue,
    options: input.options as unknown as Prisma.InputJsonValue,
  }
}

@Injectable()
export class TripsService {
  constructor(private readonly prisma: PrismaService) {}

  /** The system settings (one row), as the Admin toolbox's System Settings shows them. */
  async settings(): Promise<SystemSettings> {
    const row = await this.prisma.systemSettings.findUnique({ where: { id: 1 } })
    return { waitlistBufferPercent: row?.waitlistBufferPercent ?? 10 }
  }

  /** The admin changes the system settings; the database refuses anyone else (SystemSettings policies). */
  async setSettings(input: SystemSettings, caller: Caller): Promise<SystemSettings> {
    await this.prisma.systemSettings.update({
      where: { id: 1 },
      data: { ...input, updatedAt: new Date(), updatedByUserId: caller.userId },
    })
    return this.settings()
  }

  private async waitlistBufferPercent(): Promise<number> {
    return (await this.settings()).waitlistBufferPercent
  }

  /**
   * The trips the caller works on (their TripMember rows). Row-level security draws the same line in the database;
   * the filter here keeps it while the API still connects as the owner. Admins see every trip in the Admin toolbox.
   */
  /** The caller's trips, listed the way the Admin toolbox lists every trip: owners and sign-up counts. */
  async list(caller: Caller) {
    const rows = await this.prisma.trip.findMany({
      where: { members: { some: { userId: caller.userId } } },
      orderBy: { startDate: 'asc' },
      include: ownerIds,
    })
    // The caller is a member of each, so it reads their guests itself.
    return withCounts(
      rows,
      await countGuests(
        this.prisma,
        rows.map((r) => r.id)
      )
    )
  }

  /** A trip the caller works on; anyone else's reads as not found. An admin seats itself first (Admin toolbox). */
  async get(id: string, caller: Caller): Promise<OrganizerTrip> {
    const row = await this.prisma.trip.findFirst({
      where: { id, members: { some: { userId: caller.userId } } },
      include: withGuests,
    })
    if (!row) throw new NotFoundException('Trip not found')
    return withPhotoLinks(toOrganizerTrip(row, await this.waitlistBufferPercent()))
  }

  /**
   * A new trip and its owner, the signed-in caller, as one trusted step: under row-level security nobody may create
   * a trip on their own, because its creator cannot see it until their owner row exists (docs/tenant-isolation.md).
   */
  async create(input: TripInput, caller: Caller, slug?: string): Promise<OrganizerTrip> {
    const row = await uniqueSlug(() =>
      runAsSystem(() =>
        this.prisma.$transaction(async (tx) => {
          const trip = await tx.trip.create({
            data: { ...data(input), slug: slug ?? makeSlug(input.name) },
            include: withGuests,
          })
          await tx.tripMember.create({
            data: { tripId: trip.id, userId: caller.userId, role: 'owner' },
          })
          return trip
        })
      )
    )
    return withPhotoLinks(toOrganizerTrip(row, await this.waitlistBufferPercent()))
  }

  async update(
    id: string,
    input: TripInput,
    caller: Caller,
    slug?: string
  ): Promise<OrganizerTrip> {
    const current = await this.get(id, caller)
    // Each guest who signed agreed to the trip's way of giving spots; changing it would break that promise.
    if (input.joinMode !== current.joinMode && current.guests.some((g) => g.signedAt))
      throw new BadRequestException(
        'Guests have signed under the current rules, so who gets a spot can’t change now.'
      )
    const row = await uniqueSlug(() =>
      this.prisma.trip.update({
        where: { id },
        data: slug ? { ...data(input), slug } : data(input),
        include: withGuests,
      })
    )
    return withPhotoLinks(toOrganizerTrip(row, await this.waitlistBufferPercent()))
  }

  /** The seed's demo trips, for the homepage. Real organizers' trips are never listed publicly. */
  async listSamples(): Promise<TripSummary[]> {
    const rows = await this.prisma.trip.findMany({
      where: { isSample: true, published: true },
      orderBy: { createdAt: 'asc' },
    })
    return Promise.all(rows.map((r) => withCoverLink(toTripSummary(r))))
  }

  /** Only published trips are visible to guests; a draft reads as not found. Runs as a public page. */
  async getPublic(slug: string): Promise<PublicTrip> {
    const row = await this.prisma.trip.findUnique({
      where: { slug },
      include: { rooms: { orderBy: { position: 'asc' } } },
    })
    if (!row || !row.published) throw new NotFoundException('Trip not found')
    // Never the guest rows themselves: the database hands a public page only what it may show of them.
    const guests = await this.prisma.$queryRaw<PublicGuestRow[]>(
      Prisma.sql`SELECT * FROM "public_trip_guests"(${row.id})`
    )
    const taken = await this.prisma.$queryRaw<{ roomId: string; taken: number }[]>(
      Prisma.sql`SELECT * FROM "public_room_taken"(${row.id})`
    )
    const [{ spots, waitlisting }] = await this.prisma.$queryRaw<
      { spots: number; waitlisting: boolean }[]
    >(
      Prisma.sql`SELECT "public_spots_taken"(${row.id}) AS spots, "public_trip_waitlisting"(${row.id}) AS waitlisting`
    )
    return withPhotoLinks(
      toPublicTrip({
        ...row,
        guests,
        roomTaken: new Map(taken.map((t) => [t.roomId, t.taken])),
        spotsTaken: spots,
        waitlisting,
      })
    )
  }

  async getRooms(id: string, caller: Caller): Promise<TripRoom[]> {
    await this.get(id, caller)
    const rows = await this.prisma.room.findMany({
      where: { tripId: id },
      orderBy: { position: 'asc' },
    })
    return rows.map(({ id, name, beds, capacity, weight, bedTypes, minPeople }) => ({
      id,
      name,
      beds,
      capacity,
      weight,
      bedTypes: bedTypes as BedType[],
      minPeople,
    }))
  }

  /**
   * Saves the trip's rooms in this order: rooms with an id are updated in place (so guests' choices stay), new
   * ones are added, and rooms left out are removed (their guests keep their sign-up, with no room).
   */
  async setRooms(id: string, rooms: TripRoom[], caller: Caller): Promise<TripRoom[]> {
    await this.get(id, caller)
    const existing = new Set(
      (await this.prisma.room.findMany({ where: { tripId: id }, select: { id: true } })).map(
        (r) => r.id
      )
    )
    const kept = rooms.filter((r) => r.id && existing.has(r.id)).map((r) => r.id as string)
    await this.prisma.$transaction([
      this.prisma.room.deleteMany({ where: { tripId: id, id: { notIn: kept } } }),
      ...rooms.map(({ id: roomId, ...room }, position) =>
        roomId && existing.has(roomId)
          ? this.prisma.room.update({ where: { id: roomId }, data: { ...room, position } })
          : this.prisma.room.create({ data: { ...room, position, tripId: id } })
      ),
    ])
    return this.getRooms(id, caller)
  }

  /** The agreement as guests of this trip would sign it today, for the organizer's preview. */
  async agreement(id: string, caller: Caller): Promise<AgreementPreview> {
    return agreementPreview(await this.get(id, caller))
  }

  /** The agreement one guest signed, exactly as they saw it, with when and from where. */
  async guestAgreement(id: string, guestId: string, caller: Caller): Promise<SignedAgreement> {
    await this.get(id, caller)
    const sig = await this.prisma.agreementSignature.findFirst({ where: { guestId, tripId: id } })
    if (!sig) throw new NotFoundException('This guest has not signed the agreement')
    return toSignedAgreement(sig)
  }

  /** Everything that happened to one guest, oldest first, with room ids turned into names. */
  async guestHistory(id: string, guestId: string, caller: Caller): Promise<GuestEvent[]> {
    const trip = await this.get(id, caller)
    if (!trip.guests.some((g) => g.id === guestId)) throw new NotFoundException('Guest not found')
    return (await this.events(id, guestId)).map((e) => e.event)
  }

  /** A guest's history lines (or every guest's on the trip), oldest first, with room ids turned into names. */
  private async events(tripId: string, guestId?: string) {
    const [events, rooms] = await Promise.all([
      this.prisma.guestEvent.findMany({
        where: { tripId, ...(guestId ? { guestId } : {}) },
        orderBy: [{ at: 'asc' }, { n: 'asc' }],
      }),
      this.prisma.room.findMany({ where: { tripId }, select: { id: true, name: true } }),
    ])
    const roomName = (roomId: string | null) => rooms.find((r) => r.id === roomId)?.name ?? null
    // Joining and signing happen in one step; at the same moment, they come first.
    const rank = (kind: string) => (kind === 'joined' ? 0 : kind === 'signed' ? 1 : 2)
    events.sort((a, b) => a.at.getTime() - b.at.getTime() || rank(a.kind) - rank(b.kind))
    return events.map((e) => ({
      guestId: e.guestId,
      event: {
        at: e.at.toISOString(),
        kind: e.kind as GuestEvent['kind'],
        actor: e.actor as GuestEvent['actor'],
        fromRoom: roomName(e.fromRoomId),
        toRoom: roomName(e.toRoomId),
        fields: (e.fields ? e.fields.split(',') : []) as GuestEvent['fields'],
        amount: e.amount,
      } satisfies GuestEvent,
    }))
  }

  /**
   * The trip log, newest first: joins refused because the email is already on the trip (who tried, from where), the
   * admin's seats and opens, and, if asked, every guest's history.
   */
  async log(id: string, caller: Caller): Promise<TripLogEntry[]> {
    const trip = await this.get(id, caller)
    const [refused, access, events] = await Promise.all([
      this.prisma.tripLog.findMany({ where: { tripId: id } }),
      this.prisma.accessLog.findMany({ where: { tripId: id } }),
      this.events(id),
    ])
    const name = (guestId: string) => {
      const g = trip.guests.find((x) => x.id === guestId)
      return g ? `${g.firstName} ${g.lastName}` : 'A guest'
    }
    const entries: TripLogEntry[] = [
      ...refused.map((r) => ({
        kind: 'email_refused' as const,
        at: r.at.toISOString(),
        name: r.name,
        email: r.email,
        phone: r.phone,
        ipAddress: r.ipAddress,
        userAgent: r.userAgent,
        blocked: r.blocked,
      })),
      ...access.map((a) => ({
        kind: 'admin' as const,
        at: a.at.toISOString(),
        action: a.action as Extract<TripLogEntry, { kind: 'admin' }>['action'],
      })),
      ...events.map((e) => ({
        kind: 'guest' as const,
        at: e.event.at,
        guestId: e.guestId,
        guestName: name(e.guestId),
        event: e.event,
      })),
    ]
    // Newest first; within one moment, the order things happened in reverse.
    return entries
      .map((e, i) => ({ e, i }))
      .sort((a, b) => b.e.at.localeCompare(a.e.at) || b.i - a.i)
      .map((x) => x.e)
  }

  /**
   * The organizer's changes to a guest from Trip Control. A guest takes a spot only once they've signed. On an
   * accept-first trip the organizer accepts them before they pay; on the other two the organizer must first confirm
   * their payment arrived, and on a first come, first served trip that confirmation accepts them while spots are
   * left. Turning down a guest whose payment arrived needs the organizer to say the refund went out (owner's
   * decision, 2026-10-21): CrewControl records it and moves no money.
   */
  async updateGuest(
    id: string,
    guestId: string,
    update: GuestUpdate,
    caller: Caller
  ): Promise<OrganizerTrip> {
    const trip = await this.get(id, caller)
    const guest = trip.guests.find((g) => g.id === guestId)
    if (!guest) throw new NotFoundException('Guest not found')
    if (update.roomId) {
      const room = await this.prisma.room.findFirst({ where: { id: update.roomId, tripId: id } })
      if (!room) throw new BadRequestException('That room is not on this trip')
    }
    const payFirst = trip.joinMode !== 'accept_first'
    // Money that arrived and wasn't sent back.
    const paid = guest.payments.some((p) => p.status === 'confirmed')
    const status = update.status ?? guest.status
    // Offering a waitlisted guest the spot that opened lets them see how to pay. On an accept-first trip accepting them
    // is the offer.
    if (update.offerSpot) {
      if (!guest.waitlistedAt || guest.offeredAt || guest.status !== 'interested')
        throw new BadRequestException(`${guest.firstName} isn’t waiting on the waitlist`)
      if (trip.joinMode === 'accept_first')
        throw new BadRequestException(`Accept ${guest.firstName} to give them the spot`)
    }
    if (update.refundSent && status !== 'declined')
      throw new BadRequestException('Tick “Refund sent” only when turning a guest down')
    // A guest turned down and refunded who is put back starts paying again: the money they sent went back to them.
    const restart = guest.status === 'declined' && status === 'interested' && guest.refundSentAt
    if (status === 'approved' && guest.status !== 'approved') {
      if (guest.refundSentAt)
        throw new BadRequestException(
          `${guest.firstName}’s payment was refunded. Put them back to waiting so they can pay again.`
        )
      if (!guest.signedAt)
        throw new BadRequestException(`${guest.firstName} hasn’t signed the trip agreement yet`)
      // Accepting a guest holds their spot even when their payments don't cover the first one yet (owner's decision,
      // 2026-10-24); on the pay-first trips some payment must have arrived.
      if (payFirst && !paid)
        throw new BadRequestException(`Confirm a payment from ${guest.firstName} first`)
      if (spotsLeft(trip, guestId) <= 0) throw new ConflictException('Every spot is taken')
      const ahead = aheadOf(trip, guestId)
      if (ahead)
        throw new ConflictException(
          `${ahead.firstName}’s payment was confirmed first, so the next spot is theirs.`
        )
    }
    const refundSent = update.refundSent ?? Boolean(guest.refundSentAt)
    if (status === 'declined' && guest.status !== 'declined' && paid && !refundSent)
      throw new BadRequestException(
        `${guest.firstName} paid. Send their refund and tick “Refund sent” to turn them down.`
      )
    // The refund's time, kept on the payments it sends back.
    const refundAt = guest.refundSentAt ? new Date(guest.refundSentAt) : new Date()
    await roomFull(() =>
      this.prisma.$transaction(async (tx) => {
        await tx.guest.update({
          where: { id: guestId },
          data: {
            status,
            // A guest turned down gives up the room they asked for.
            ...(status === 'declined'
              ? { roomId: null }
              : update.roomId === undefined
                ? {}
                : { roomId: update.roomId }),
            ...(update.refundSent === undefined
              ? {}
              : {
                  refundSentAt: update.refundSent ? refundAt : null,
                }),
            ...(restart ? { refundSentAt: null } : {}),
            ...(update.offerSpot ? { offeredAt: new Date() } : {}),
          },
        })
        // The refund sends back what arrived, so those payments stop counting; undoing it counts them again. A guest
        // put back keeps them refunded and pays again.
        if (update.refundSent === true && !guest.refundSentAt)
          await tx.payment.updateMany({
            where: { guestId, status: 'confirmed' },
            data: { status: 'refunded', refundedAt: refundAt },
          })
        if (update.refundSent === false && guest.refundSentAt)
          // Only the payments this refund covered: money refunded in an earlier round stays refunded.
          await tx.payment.updateMany({
            where: { guestId, status: 'refunded', refundedAt: new Date(guest.refundSentAt) },
            data: { status: 'confirmed', refundedAt: null },
          })
      })
    )
    // Email and texts are mocked until slice 4.
    if (update.offerSpot)
      await sendText(
        guest.phone,
        `A spot opened on ${trip.name}. Pay ${trip.organizerName} to take it: ` +
          `${(process.env.FRONTEND_URL ?? 'http://localhost:5173').split(',')[0].trim()}/t/${trip.slug}/join`
      )
    return this.get(id, caller)
  }

  /**
   * The organizer decides a reported payment: it arrived (what the guest said they sent, unless they say otherwise), it
   * didn't, or undo that. On a first come trip a payment that pays the spot takes the next one.
   */
  async decidePayment(
    id: string,
    paymentId: string,
    decision: PaymentDecision,
    caller: Caller
  ): Promise<OrganizerTrip> {
    const trip = await this.get(id, caller)
    const guest = trip.guests.find((g) => g.payments.some((p) => p.id === paymentId))
    const payment = guest?.payments.find((p) => p.id === paymentId)
    if (!guest || !payment) throw new NotFoundException('Payment not found')
    if (payment.status === 'refunded') throw new BadRequestException('That payment was refunded')
    const confirmed = decision.status === 'confirmed'
    const received = confirmed
      ? (decision.receivedPaymentAmount ?? payment.guestPaymentAmount)
      : null
    // The same decision again changes nothing, except correcting what arrived on a confirmed payment.
    if (
      decision.status === payment.status &&
      !(confirmed && received !== payment.receivedPaymentAmount)
    )
      return trip
    // A turned-down guest's money is refunded, not confirmed: put them back first.
    if (confirmed && payment.status !== 'confirmed' && guest.status === 'declined')
      throw new BadRequestException(
        `${guest.firstName} was turned down. Put them back to waiting before confirming their payment.`
      )
    // A payment the organizer logged was never the guest's word: it can be removed, not put back to waiting.
    if (decision.status === 'reported' && payment.loggedBy === 'organizer')
      throw new BadRequestException('Remove a payment you logged instead of undoing it')
    // Where the payment earned the spot, taking it back needs the spot given back first.
    if (
      payment.status === 'confirmed' &&
      !confirmed &&
      trip.joinMode !== 'accept_first' &&
      guest.status === 'approved' &&
      guest.payments.filter((p) => p.status === 'confirmed').length === 1
    )
      throw new BadRequestException(
        `${guest.firstName} has a spot. Put them back to waiting before undoing their payment.`
      )
    await this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: decision.status,
        receivedPaymentAmount: received,
        decidedAt: decision.status === 'reported' ? null : new Date(),
        decidedByUserId: decision.status === 'reported' ? null : caller.userId,
      },
    })
    if (confirmed) await this.firstComeAccept(id, guest.id, caller)
    return this.get(id, caller)
  }

  /** The organizer logs a payment handed over in person (or any they saw arrive): confirmed as it is logged. */
  async logPayment(
    id: string,
    guestId: string,
    input: PaymentLog,
    caller: Caller
  ): Promise<OrganizerTrip> {
    const trip = await this.get(id, caller)
    const guest = trip.guests.find((g) => g.id === guestId)
    if (!guest) throw new NotFoundException('Guest not found')
    if (guest.status === 'declined')
      throw new BadRequestException(`${guest.firstName} was turned down`)
    const now = new Date()
    await this.prisma.payment.create({
      data: {
        tripId: id,
        guestId,
        guestPaymentAmount: input.receivedPaymentAmount,
        receivedPaymentAmount: input.receivedPaymentAmount,
        method: input.method,
        methodKind: 'other',
        sentOn: input.sentOn,
        note: input.note,
        status: 'confirmed',
        loggedBy: 'organizer',
        decidedAt: now,
        decidedByUserId: caller.userId,
      },
    })
    await this.firstComeAccept(id, guestId, caller)
    return this.get(id, caller)
  }

  /**
   * First come, first served: once confirmed payments pay a waiting guest's spot, they take the next one, in the order
   * spots were paid. When another organizer took the last spot a moment ago, the payment stays recorded and the guest
   * waits (they are the one refunded).
   */
  private async firstComeAccept(id: string, guestId: string, caller: Caller): Promise<void> {
    const trip = await this.get(id, caller)
    const guest = trip.guests.find((g) => g.id === guestId)
    if (
      trip.joinMode !== 'first_come' ||
      !guest ||
      guest.status !== 'interested' ||
      !guest.signedAt ||
      !guest.spotPaidAt ||
      guest.refundSentAt ||
      spotsLeft(trip, guestId) <= 0 ||
      aheadOf(trip, guestId)
    )
      return
    try {
      await roomFull(() =>
        this.prisma.guest.update({ where: { id: guestId }, data: { status: 'approved' } })
      )
    } catch (err) {
      if (!(err instanceof ConflictException && /Every spot/.test(err.message))) throw err
    }
  }

  /**
   * Every trip, for the Admin toolbox: its owners' user ids and its going and interested counts. The admin's mark
   * reads every trip and its people but no guest row, so the counts come from the database (admin_trip_counts).
   */
  async listAll() {
    const rows = await this.prisma.trip.findMany({
      orderBy: { startDate: 'asc' },
      include: ownerIds,
    })
    // The admin reads no guest row, so its counts come from admin_trip_counts. Connected as the owner (row-level
    // security off) the admin mark isn't set, so count directly.
    const counts = rlsActive()
      ? await this.prisma.$queryRaw<GuestCounts[]>(Prisma.sql`SELECT * FROM "admin_trip_counts"()`)
      : await countGuests(this.prisma)
    return withCounts(rows, counts)
  }

  /**
   * The admin seats itself on a trip, so it can open the trip's Trip Control panel as a member: as an organizer, or
   * as the owner of a trip that has none (one made before sign-in). The database logs every such change
   * (TripMember_9_admin_logged). Sample trips are reset by the seed, so a seat on one lasts until the next deploy.
   */
  async seat(id: string, caller: Caller, asOwner: boolean): Promise<void> {
    const trip = await this.prisma.trip.findUnique({
      where: { id },
      include: { members: { select: { userId: true, role: true } } },
    })
    if (!trip) throw new NotFoundException('Trip not found')
    const mine = trip.members.find((m) => m.userId === caller.userId)
    const hasOwner = trip.members.some((m) => m.role === 'owner')
    if (asOwner && hasOwner && mine?.role !== 'owner')
      throw new BadRequestException('This trip already has an owner')
    if (asOwner && trip.isSample) throw new BadRequestException('Sample trips stay ownerless')
    if (mine && asOwner && mine.role !== 'owner') {
      // Already seated as an organizer: take over as the owner (the database logs the change).
      await this.prisma.tripMember.update({
        where: { tripId_userId: { tripId: id, userId: caller.userId } },
        data: { role: 'owner' },
      })
    } else if (!mine) {
      try {
        await this.prisma.tripMember.create({
          data: { tripId: id, userId: caller.userId, role: asOwner ? 'owner' : 'organizer' },
        })
        return // The seat itself is the log line (TripMember_9_admin_logged).
      } catch (err) {
        // A double click: the other request seated the admin first.
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'))
          throw err
      }
    }
    // Already on the trip: still a line for this look. Connected as the owner (row-level security off) the admin
    // mark isn't set, so the line is written directly.
    if (rlsActive()) await this.prisma.$executeRaw(Prisma.sql`SELECT "admin_log_open"(${id})`)
    else
      await this.prisma.accessLog.create({
        data: {
          tripId: id,
          actorUserId: caller.userId,
          action: 'open',
          subjectUserId: caller.userId,
        },
      })
  }
}

/** The room trigger's "no place left" (Guest_5_room_fits) as a 409 the page can show. */
export async function roomFull<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write()
  } catch (err) {
    if (/trip_full/.test(String((err as Error).message)))
      throw new ConflictException('Every spot is taken')
    const name = /room_full:([^"\n]*)/.exec(String((err as Error).message))?.[1]
    if (name !== undefined)
      throw new ConflictException(`${name.trim()} is full. Pick another room.`)
    if (/That room is not on this trip/.test(String((err as Error).message)))
      throw new BadRequestException('That room is not on this trip')
    throw err
  }
}

interface GuestCounts {
  tripId: string
  going: number
  interested: number
}

const ownerIds = { members: { where: { role: 'owner' }, select: { userId: true } } } as const

/** Going and interested per trip, for the trips the caller can read (or `tripIds` of them). */
async function countGuests(prisma: PrismaService, tripIds?: string[]): Promise<GuestCounts[]> {
  const groups = await prisma.guest.groupBy({
    by: ['tripId', 'status'],
    where: tripIds ? { tripId: { in: tripIds } } : undefined,
    _count: { _all: true },
  })
  return groups.reduce<GuestCounts[]>((out, g) => {
    let c = out.find((x) => x.tripId === g.tripId)
    if (!c) out.push((c = { tripId: g.tripId, going: 0, interested: 0 }))
    if (g.status === 'approved') c.going += g._count._all
    else if (g.status === 'interested') c.interested += g._count._all
    return out
  }, [])
}

/** A trip list's rows: the summary, its owners' ids (the controller names them), and its sign-up counts. */
function withCounts(
  rows: (Parameters<typeof toTripSummary>[0] & {
    maxGuests: number | null
    joinMode: string
    members: { userId: string }[]
  })[],
  counts: GuestCounts[]
) {
  return Promise.all(
    rows.map(({ members, ...row }) => {
      const c = counts.find((x) => x.tripId === row.id) ?? { going: 0, interested: 0 }
      return withCoverLink({
        ...toTripSummary(row),
        ownerIds: members.map((m) => m.userId),
        guestCount: c.going + c.interested,
        goingCount: c.going,
        interestedCount: c.interested,
        maxGuests: row.maxGuests,
        joinMode: row.joinMode,
      })
    })
  )
}

/** Spots left for this guest: the limit less the other guests accepted. */
function spotsLeft(trip: OrganizerTrip, guestId: string): number {
  return trip.maxGuests === null
    ? Infinity
    : trip.maxGuests - trip.guests.filter((g) => g.status === 'approved' && g.id !== guestId).length
}

/**
 * First come, first served goes in the order spots were paid: a waiting guest whose spot was paid earlier (and not
 * refunded) is ahead of this one.
 */
function aheadOf(trip: OrganizerTrip, guestId: string): Guest | undefined {
  if (trip.joinMode !== 'first_come') return undefined
  const paidAt = trip.guests.find((g) => g.id === guestId)?.spotPaidAt ?? new Date().toISOString()
  return trip.guests.find(
    (g) =>
      g.id !== guestId &&
      g.status === 'interested' &&
      g.signedAt &&
      g.spotPaidAt &&
      !g.refundSentAt &&
      g.spotPaidAt < paidAt
  )
}

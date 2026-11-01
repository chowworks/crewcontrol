import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import type { Caller } from '../auth/caller'
import { ClerkService } from '../auth/clerk.service'
import { runAsSystem } from '../core/tenant-context'
import {
  isPhotoRef,
  photoBucket,
  photoUrl,
  withCoverLink,
  withPhotoLinks,
} from '../photos/photo-bucket'
import { PrismaService, rlsActive } from '../prisma/prisma.service'
import { agreementPreview, money } from '../join/agreement'
import { sendText } from '../join/send-text'
import { EmailsService } from '../messaging/emails.service'
import {
  eraseOn,
  toOrganizerTrip,
  toPublicTrip,
  toSignedAgreement,
  toTripSummary,
  type PublicGuestRow,
} from './trip-mapper'
import type {
  AgreementPreview,
  BalanceAdjustmentInput,
  BedType,
  GuestEvent,
  Guest,
  GuestUpdate,
  OrganizerTrip,
  Payment,
  PaymentDecision,
  PaymentLog,
  PublicTrip,
  EarlyAccessInput,
  OrganizerRequestInput,
  SignedAgreement,
  SystemSettings,
  TripChange,
  TripInput,
  TripLogEntry,
  TripPhoto,
  QuestionStatus,
  TripRole,
  TripRoom,
  TripSummary,
} from './trip-types'
import { makeSlug } from './slug'
import { recordChange, roomChanges, tripChanges, type RoomState } from './trip-changes'
import {
  paymentPlan,
  ROOMS_PRICED_APART,
  roomsPricedApart,
  totalDueCents,
  tripActionCount,
} from './trip-types'

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

export const withGuests = {
  guests: {
    orderBy: { createdAt: 'asc' },
    include: { agreement: true, payments: true, adjustments: true },
  },
  rooms: { orderBy: { position: 'asc' } },
  forwardedReceipts: { where: { status: 'unmatched' }, orderBy: { receivedAt: 'asc' } },
  payerAddresses: { orderBy: { createdAt: 'asc' } },
  // Each question nobody answered is one of Trip Control's Actions (issue #13).
  questions: { where: { status: 'waiting' }, select: { id: true } },
} satisfies Prisma.TripInclude

function data(input: TripInput) {
  return {
    ...input,
    photos: input.photos as unknown as Prisma.InputJsonValue,
    highlights: input.highlights as unknown as Prisma.InputJsonValue,
    keyDates: input.keyDates as unknown as Prisma.InputJsonValue,
    paymentDueDates: input.paymentDueDates as unknown as Prisma.InputJsonValue,
    paymentMethods: input.paymentMethods as unknown as Prisma.InputJsonValue,
    options: input.options as unknown as Prisma.InputJsonValue,
  }
}

@Injectable()
export class TripsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clerk: ClerkService,
    private readonly emails: EmailsService
  ) {}

  /** The system settings (one row), as the Admin toolbox's System Settings shows them. */
  async settings(): Promise<SystemSettings> {
    const row = await this.prisma.systemSettings.findUnique({ where: { id: 1 } })
    return {
      waitlistBufferPercent: row?.waitlistBufferPercent ?? 10,
      limitedPreview: row?.limitedPreview ?? true,
      alertWindowHours: row?.alertWindowHours ?? 4,
    }
  }

  /** The admin changes the system settings; the database refuses anyone else (SystemSettings policies). */
  async setSettings(input: SystemSettings, caller: Caller): Promise<SystemSettings> {
    await this.prisma.systemSettings.update({
      where: { id: 1 },
      data: { ...input, updatedAt: new Date(), updatedByUserId: caller.userId },
    })
    return this.settings()
  }

  /**
   * An organizer asks for something Travel HQ doesn't do yet (other refund terms), in their words, with the trip
   * they were setting up when it's one of theirs. Kept for the Travel HQ team; only the admin reads them.
   */
  async addRequest(input: OrganizerRequestInput, caller: Caller): Promise<void> {
    const trip = input.tripId
      ? await this.prisma.trip.findFirst({
          where: {
            id: input.tripId,
            deletedAt: null,
            members: { some: { userId: caller.userId } },
          },
          select: { id: true, name: true },
        })
      : null
    // Written without reading it back: only the admin reads requests, and create() would read the new row.
    await this.prisma.organizerRequest.createMany({
      data: {
        kind: input.kind,
        userId: caller.userId,
        tripId: trip?.id ?? null,
        tripName: trip?.name ?? '',
        text: input.text,
      },
    })
  }

  /** Every request, newest first, for the Admin toolbox (who asked comes from sign-in, by user id). */
  async listRequests() {
    return this.prisma.organizerRequest.findMany({ orderBy: { createdAt: 'desc' }, take: 500 })
  }

  /** Every early access request from the limited preview page, newest first, for the Admin toolbox. */
  async listEarlyAccess() {
    return this.prisma.earlyAccessRequest.findMany({ orderBy: { createdAt: 'desc' }, take: 500 })
  }

  /**
   * Someone who runs a trip refers a person (issue #39): an early access request tagged with who referred them, for
   * the admin to approve. Referring someone already on the list tags their request, unless someone referred them first.
   * Trusted work, because only the admin reads the list.
   */
  async refer(input: EarlyAccessInput, caller: Caller): Promise<void> {
    const runs = await this.prisma.tripMember.count({
      where: { userId: caller.userId, trip: { deletedAt: null } },
    })
    if (!(await this.settings()).limitedPreview)
      throw new ForbiddenException(
        'Travel HQ is open to everyone now, so there is nobody to refer.'
      )
    if (!runs && !caller.isAdmin)
      throw new ForbiddenException('Only people who run a trip on Travel HQ can refer someone.')
    const { name, email, note } = input
    const referrer = (await this.clerk.people([caller.userId])).get(caller.userId)
    await runAsSystem(async () => {
      await this.prisma.earlyAccessRequest.createMany({
        data: { name, email, note, referredByUserId: caller.userId },
        skipDuplicates: true,
      })
      await this.prisma.earlyAccessRequest.updateMany({
        where: { email, referredByUserId: null },
        data: { referredByUserId: caller.userId },
      })
    })
    this.emails.alertEarlyAccess({
      name,
      email,
      note,
      referredBy: { name: referrer?.name ?? 'Someone', email: referrer?.email ?? '' },
    })
  }

  /** The admin approves an early access request, or undoes it. */
  async setEarlyAccessApproved(id: string, approved: boolean): Promise<void> {
    const { count } = await this.prisma.earlyAccessRequest.updateMany({
      where: { id },
      data: { approvedAt: approved ? new Date() : null },
    })
    if (!count) throw new NotFoundException('Request not found')
  }

  /** Whether the caller may start trips: an admin, or someone whose verified email the admin approved for early access. */
  async canStartTrips(caller: Caller): Promise<boolean> {
    if (caller.isAdmin || !(await this.settings()).limitedPreview) return true
    const emails = await this.clerk.verifiedEmails(caller.userId)
    if (!emails.length) return false
    const approved = await runAsSystem(() =>
      this.prisma.earlyAccessRequest.count({
        where: { email: { in: emails }, approvedAt: { not: null } },
      })
    )
    return approved > 0
  }

  private async waitlistBufferPercent(): Promise<number> {
    return (await this.settings()).waitlistBufferPercent
  }

  /**
   * The trips the caller works on (their TripMember rows). Row-level security draws the same line in the database;
   * the filter here keeps it while the API still connects as the owner. Admins see every trip in the Admin toolbox.
   */
  /**
   * The caller's trips, listed the way the Admin toolbox lists every trip: owners and sign-up counts. Trips they own and
   * deleted are listed too, until they're erased, so an owner can restore one.
   */
  async list(caller: Caller) {
    const rows = await this.prisma.trip.findMany({
      where: { deletedAt: null, members: { some: { userId: caller.userId } } },
      orderBy: { startDate: 'asc' },
      include: ownerIds,
    })
    // The caller is a member of each, so it reads their guests itself.
    const actions = await this.actionCounts(caller)
    const listed = await withCounts(
      rows,
      await countGuests(
        this.prisma,
        rows.map((r) => r.id)
      )
    )
    // What needs the caller on each, as Trip Control's Actions counts it (the red count on Your trips).
    return [
      ...listed.map((t) => ({ ...t, actionCount: actions.get(t.id)?.count ?? 0 })),
      ...(await this.deletedOf(caller)),
    ]
  }

  /**
   * The trips the caller owns that are deleted and not yet erased. A deleted trip is nobody's to read (trips_of_user),
   * so this is trusted work, limited to the caller's own ownerships.
   */
  private deletedOf(caller: Caller) {
    return runAsSystem(async () => {
      const rows = await this.prisma.trip.findMany({
        where: {
          deletedAt: { not: null },
          members: { some: { userId: caller.userId, role: 'owner' } },
        },
        orderBy: { deletedAt: 'desc' },
        include: ownerIds,
      })
      return withCounts(
        rows,
        await countGuests(
          this.prisma,
          rows.map((r) => r.id)
        )
      )
    })
  }

  /**
   * What needs the caller on each trip they work on: the same things Trip Control's Actions lists (guestActions in
   * trip-types), counted, with the trip's name.
   */
  async actionCounts(caller: Caller): Promise<Map<string, { name: string; count: number }>> {
    const rows = await this.prisma.trip.findMany({
      where: { deletedAt: null, members: { some: { userId: caller.userId } } },
      include: withGuests,
    })
    const buffer = await this.waitlistBufferPercent()
    return new Map(
      rows.map((r) => [r.id, { name: r.name, count: tripActionCount(toOrganizerTrip(r, buffer)) }])
    )
  }

  /**
   * A trip the caller works on; anyone else's, or a deleted one, reads as not found. `admin` is true only on the Admin
   * toolbox's routes, where the admin mark reads any trip, deleted ones too, read-only and without a seat (owner's
   * decisions, 2026-10-28 and 2026-10-30).
   */
  async get(id: string, caller: Caller, admin = false): Promise<OrganizerTrip> {
    const row = await this.prisma.trip.findFirst({
      where: admin ? { id } : { id, deletedAt: null, members: { some: { userId: caller.userId } } },
      include: withGuests,
    })
    if (!row) throw new NotFoundException('Trip not found')
    return withPhotoLinks(toOrganizerTrip(row, await this.waitlistBufferPercent()))
  }

  /**
   * The cover photo's bytes, for the flyer the organizer makes in the browser: the photo bucket has no CORS rule, so a
   * browser can't draw a signed link onto a canvas. Null when the cover isn't in the bucket (the browser loads it).
   */
  async coverPhoto(id: string, caller: Caller): Promise<{ bytes: Buffer; type: string } | null> {
    const row = await this.prisma.trip.findFirst({
      where: { id, deletedAt: null, members: { some: { userId: caller.userId } } },
      select: { photos: true },
    })
    if (!row) throw new NotFoundException('Trip not found')
    const ref = (row.photos as unknown as TripPhoto[])[0]?.url
    if (!ref || !isPhotoRef(ref) || !photoBucket()) return null
    const res = await fetch(await photoUrl(ref))
    if (!res.ok) throw new ServiceUnavailableException('The cover photo could not be loaded')
    return {
      bytes: Buffer.from(await res.arrayBuffer()),
      type: res.headers.get('content-type') ?? 'image/jpeg',
    }
  }

  /**
   * A new trip and its owner, the signed-in caller, as one trusted step: under row-level security nobody may create
   * a trip on their own, because its creator cannot see it until their owner row exists (docs/tenant-isolation.md).
   */
  async create(input: TripInput, caller: Caller, slug?: string): Promise<OrganizerTrip> {
    // A limited preview (owner's decision, 2026-10-30): only admins, and people the admin approved for early access,
    // start trips. Everyone keeps running the trips they're already on; the web app shows everyone else the early
    // access page.
    if (!(await this.canStartTrips(caller)))
      throw new ForbiddenException(
        'Travel HQ is in a limited preview: only our team starts trips for now.'
      )
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
    // The same for refunds: each guest who signed agreed to this policy.
    if (input.refundPolicy !== current.refundPolicy && current.guests.some((g) => g.signedAt))
      throw new BadRequestException(
        'Guests have signed under the current refund terms, so they can’t change now.'
      )
    const rooms = await this.prisma.room.findMany({ where: { tripId: id } })
    if (
      roomsPricedApart(rooms, input.costPerPersonCents) &&
      !(input.options.roomChoice && input.options.roomRequired)
    )
      throw new BadRequestException(ROOMS_PRICED_APART)
    // As stored, photos as references: what the trip log compares (owner's decision, 2026-11-01).
    const before = await this.prisma.trip.findUnique({ where: { id } })
    const row = await uniqueSlug(() =>
      this.prisma.trip.update({
        where: { id },
        data: slug ? { ...data(input), slug } : data(input),
        include: withGuests,
      })
    )
    await recordChange(this.prisma, id, caller, () => {
      const fields = before ? tripChanges(before, row) : []
      return fields.length ? { what: 'trip', fields } : null
    })
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
    // The answers for everyone, never who asked (issue #13).
    const faq = await this.prisma.tripQuestion.findMany({
      where: { tripId: row.id, status: 'public' },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, question: true, answer: true },
    })
    return withPhotoLinks(
      toPublicTrip({
        ...row,
        guests,
        faq,
        roomTaken: new Map(taken.map((t) => [t.roomId, t.taken])),
        spotsTaken: spots,
        waitlisting,
      })
    )
  }

  async getRooms(id: string, caller: Caller, admin = false): Promise<TripRoom[]> {
    await this.get(id, caller, admin)
    const rows = await this.prisma.room.findMany({
      where: { tripId: id },
      orderBy: { position: 'asc' },
    })
    return rows.map(({ id, name, beds, capacity, weight, bedTypes, minPeople, priceCents }) => ({
      id,
      name,
      beds,
      capacity,
      weight,
      bedTypes: bedTypes as BedType[],
      minPeople,
      priceCents,
    }))
  }

  /**
   * Saves the trip's rooms in this order: rooms with an id are updated in place (so guests' choices stay), new
   * ones are added, and rooms left out are removed (their guests keep their sign-up, with no room).
   */
  async setRooms(id: string, rooms: TripRoom[], caller: Caller): Promise<TripRoom[]> {
    const trip = await this.get(id, caller)
    if (
      roomsPricedApart(rooms, trip.costPerPersonCents) &&
      !(trip.options.roomChoice && trip.options.roomRequired)
    )
      throw new BadRequestException(ROOMS_PRICED_APART)
    const existing = new Set(
      (await this.prisma.room.findMany({ where: { tripId: id }, select: { id: true } })).map(
        (r) => r.id
      )
    )
    const kept = rooms.filter((r) => r.id && existing.has(r.id)).map((r) => r.id as string)
    const before = await this.prisma.room.findMany({
      where: { tripId: id },
      orderBy: { position: 'asc' },
    })
    await this.prisma.$transaction([
      this.prisma.room.deleteMany({ where: { tripId: id, id: { notIn: kept } } }),
      ...rooms.map(({ id: roomId, ...room }, position) =>
        roomId && existing.has(roomId)
          ? this.prisma.room.update({ where: { id: roomId }, data: { ...room, position } })
          : this.prisma.room.create({ data: { ...room, position, tripId: id } })
      ),
    ])
    const after = await this.getRooms(id, caller)
    await recordChange(this.prisma, id, caller, () =>
      roomChanges(before, after as RoomState[], trip.costPerPersonCents)
    )
    return after
  }

  /** The agreement as guests of this trip would sign it today, for the organizer's preview. */
  async agreement(id: string, caller: Caller, admin = false): Promise<AgreementPreview> {
    const trip = await this.get(id, caller, admin)
    return agreementPreview({
      ...trip,
      paymentPlan: paymentPlan(
        trip.costPerPersonCents,
        trip.installmentCount,
        trip.firstPaymentCents,
        trip.paymentDueDates
      ),
      organizer: await this.organizerContact(id),
    })
  }

  /**
   * Who the trip agreement is with: the trip's first owner, by the name and email they signed in with. Trusted work,
   * because a guest about to sign may not read the trip's members. Null for a trip with no owner (the sample trips).
   */
  async organizerContact(tripId: string): Promise<{ name: string; email: string } | null> {
    const owner = await runAsSystem(() =>
      this.prisma.tripMember.findFirst({
        where: { tripId, role: 'owner' },
        orderBy: { createdAt: 'asc' },
        select: { userId: true },
      })
    )
    return owner ? this.clerk.contact(owner.userId) : null
  }

  /**
   * Everyone who runs the trip, owners and organizers, by the name and email they signed in with: who a guest's
   * question goes to (issue #13). Trusted work, because the asker may not read the trip's members.
   */
  async organizerContacts(tripId: string): Promise<{ name: string; email: string }[]> {
    const members = await runAsSystem(() =>
      this.prisma.tripMember.findMany({
        where: { tripId },
        orderBy: { createdAt: 'asc' },
        select: { userId: true },
      })
    )
    const people = await this.clerk.people(members.map((m) => m.userId))
    return members.flatMap((m) => people.get(m.userId) ?? []).filter((p) => p.email)
  }

  /** The agreement one guest signed, exactly as they saw it, with when and from where. */
  async guestAgreement(
    id: string,
    guestId: string,
    caller: Caller,
    admin = false
  ): Promise<SignedAgreement> {
    await this.get(id, caller, admin)
    const sig = await this.prisma.agreementSignature.findFirst({ where: { guestId, tripId: id } })
    if (!sig) throw new NotFoundException('This guest has not signed the agreement')
    return toSignedAgreement(sig)
  }

  /** Everything that happened to one guest, oldest first, with room ids turned into names. */
  async guestHistory(
    id: string,
    guestId: string,
    caller: Caller,
    admin = false
  ): Promise<GuestEvent[]> {
    const trip = await this.get(id, caller, admin)
    if (!trip.guests.some((g) => g.id === guestId)) throw new NotFoundException('Guest not found')
    return (await this.events(id, guestId)).map((e) => e.event)
  }

  /**
   * A guest's history lines (or every guest's on the trip), oldest first, with room ids turned into names. Adjustment
   * lines carry their reason and the organizer who made them, by name from sign-in (issue #17).
   */
  private async events(tripId: string, guestId?: string) {
    const [events, rooms, adjustments] = await Promise.all([
      this.prisma.guestEvent.findMany({
        where: { tripId, ...(guestId ? { guestId } : {}) },
        orderBy: [{ at: 'asc' }, { n: 'asc' }],
      }),
      this.prisma.room.findMany({ where: { tripId }, select: { id: true, name: true } }),
      this.prisma.balanceAdjustment.findMany({
        where: { tripId, ...(guestId ? { guestId } : {}) },
        select: { id: true, reason: true },
      }),
    ])
    const roomName = (roomId: string | null) => rooms.find((r) => r.id === roomId)?.name ?? null
    const people = await this.clerk.names([
      ...new Set(events.flatMap((e) => (e.adjustmentId && e.actorUserId ? [e.actorUserId] : []))),
    ])
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
        reason: adjustments.find((a) => a.id === e.adjustmentId)?.reason ?? null,
        byName: e.adjustmentId && e.actorUserId ? (people.get(e.actorUserId) ?? null) : null,
      } satisfies GuestEvent,
    }))
  }

  /**
   * The trip log, newest first: joins refused because the email is already on the trip (who tried, from where), what
   * organizers changed, changes to the trip's people, and every guest's history.
   */
  async log(id: string, caller: Caller, admin = false): Promise<TripLogEntry[]> {
    const trip = await this.get(id, caller, admin)
    const [refused, access, events, questions] = await Promise.all([
      this.prisma.tripLog.findMany({ where: { tripId: id } }),
      this.prisma.accessLog.findMany({ where: { tripId: id } }),
      this.events(id),
      this.prisma.tripQuestion.findMany({ where: { tripId: id } }),
    ])
    const changes = refused.filter((r) => r.kind === 'change')
    // Who changed the trip's people, and whom, and who changed the trip, by name from sign-in.
    const people = await this.clerk.names([
      ...new Set([
        ...access.flatMap((a) => [a.actorUserId, a.subjectUserId]),
        ...changes.flatMap((c) => (c.actorUserId ? [c.actorUserId] : [])),
      ]),
    ])
    const person = (userId: string) => people.get(userId) ?? 'Someone'
    const name = (guestId: string) => {
      const g = trip.guests.find((x) => x.id === guestId)
      return g ? `${g.firstName} ${g.lastName}` : 'A guest'
    }
    const entries: TripLogEntry[] = [
      ...refused
        .filter((r) => r.kind === 'email_refused')
        .map((r) => ({
          kind: 'email_refused' as const,
          at: r.at.toISOString(),
          name: r.name,
          email: r.email,
          phone: r.phone,
          ipAddress: r.ipAddress,
          userAgent: r.userAgent,
          blocked: r.blocked,
        })),
      ...changes.map((c) => ({
        kind: 'change' as const,
        at: c.at.toISOString(),
        byAdmin: c.byAdmin,
        // The admin's name stays off organizers' screens (and out of what the browser gets).
        actorName: c.byAdmin ? 'An admin' : c.actorUserId ? person(c.actorUserId) : 'Someone',
        change: c.details as unknown as TripChange,
      })),
      ...access.map((a) => ({
        kind: 'people' as const,
        at: a.at.toISOString(),
        action: a.action as Extract<TripLogEntry, { kind: 'people' }>['action'],
        byAdmin: a.byAdmin,
        actorName: person(a.actorUserId),
        subjectName: person(a.subjectUserId),
        self: a.actorUserId === a.subjectUserId,
        role: a.role as TripRole | null,
        oldRole: a.oldRole as TripRole | null,
      })),
      ...events.map((e) => ({
        kind: 'guest' as const,
        at: e.event.at,
        guestId: e.guestId,
        guestName: name(e.guestId),
        event: e.event,
      })),
      // Questions (issue #13): when each was asked and answered, or added by an organizer.
      ...questions.flatMap((q) => {
        const base = {
          kind: 'question' as const,
          askerName: q.askerUserId ? q.askerName || 'Someone' : null,
          question: q.question,
          status: q.status as QuestionStatus,
        }
        const answered = q.answeredAt && {
          ...base,
          at: q.answeredAt.toISOString(),
          action: q.askerUserId ? ('answered' as const) : ('added' as const),
          name: q.answeredByName || 'An organizer',
        }
        if (!q.askerUserId) return answered ? [answered] : []
        const asked = {
          ...base,
          at: q.createdAt.toISOString(),
          action: 'asked' as const,
          name: q.askerName || 'Someone',
        }
        return answered ? [asked, answered] : [asked]
      }),
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
   * decision, 2026-10-21): Travel HQ records it and moves no money.
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
    // Withdrawing an offer puts the guest back on the waitlist (owner's decision, 2026-10-27). Once they've paid or said
    // they paid, it's a refund instead: turn them down.
    if (update.withdrawOffer) {
      if (!guest.offeredAt || guest.status !== 'interested' || update.status)
        throw new BadRequestException(`${guest.firstName} has no offer to withdraw`)
      if (guest.payments.some((p) => p.status === 'reported' || p.status === 'confirmed'))
        throw new BadRequestException(
          `${guest.firstName} already paid or says they did. Turn them down and send a refund instead.`
        )
    }
    if (update.refundSent && status !== 'declined')
      throw new BadRequestException('Tick “Refund sent” only when turning a guest down')
    // Who looks after the guest (issue #11): another guest on the trip with an account of their own, or the guest
    // themselves, which needs an account of their own too.
    let managedByUserId: string | null | undefined
    if (update.managedBy !== undefined) {
      if (update.managedBy === guestId)
        throw new BadRequestException(`Pick someone other than ${guest.firstName}`)
      const by = update.managedBy
        ? await this.prisma.guest.findFirst({
            where: { id: update.managedBy, tripId: id },
            select: { userId: true },
          })
        : null
      if (update.managedBy && !by?.userId)
        throw new BadRequestException('Pick a guest who signed in to join')
      // Handing a guest to someone else makes them able to sign for them: only once the guest has signed.
      if (update.managedBy && !guest.signedAt)
        throw new BadRequestException(
          `${guest.firstName} hasn’t signed the trip agreement, so nobody else can handle it`
        )
      if (!update.managedBy && !guest.hasAccount)
        throw new BadRequestException(
          `${guest.firstName} hasn’t signed in yet, so someone has to look after them`
        )
      // One email per trip holds for guests who look after themselves.
      if (
        !update.managedBy &&
        trip.guests.some(
          (x) =>
            x.id !== guestId && !x.managedBy && x.email.toLowerCase() === guest.email.toLowerCase()
        )
      )
        throw new ConflictException(
          `${guest.firstName} shares an email with another guest. Change one of them first.`
        )
      managedByUserId = by?.userId ?? null
    }
    // A corrected address after emails bounced (owner's decision, 2026-10-29): still one email per trip for guests who
    // look after themselves. A new address, or the organizer saying they've seen a spam complaint, clears the problem.
    if (
      update.email &&
      !guest.managedBy &&
      trip.guests.some(
        (x) => x.id !== guestId && !x.managedBy && x.email.toLowerCase() === update.email
      )
    )
      throw new ConflictException('Another guest on this trip already uses that email.')
    const emailFix =
      update.email !== undefined || update.emailProblemSeen
        ? {
            ...(update.email === undefined ? {} : { email: update.email }),
            emailProblem: null,
            emailProblemAt: null,
          }
        : {}
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
            ...emailFix,
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
            ...(update.withdrawOffer ? { offeredAt: null } : {}),
            ...(managedByUserId === undefined ? {} : { managedByUserId }),
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
    // Texts are mocked until SMS is built (issue #33); the emails below go.
    if (update.offerSpot)
      await sendText(
        guest.phone,
        `A spot opened on ${trip.name}. Pay ${trip.organizerName} to take it: ` +
          `${(process.env.FRONTEND_URL ?? 'http://localhost:5173').split(',')[0].trim()}/t/${trip.slug}/join`
      )
    if (update.withdrawOffer)
      await sendText(
        guest.phone,
        `The spot ${trip.organizerName} offered you on ${trip.name} is no longer available. You're still on the waitlist.`
      )
    const after = await this.get(id, caller)
    // The guest hears of each step by email (issues #12 and #46), worded by the admin on the Emails page: accepted (on an
    // accept-first trip with how to pay, on the others to say their payment holds the spot), offered a spot that
    // opened, or the offer taken back.
    if (status === 'approved' && guest.status !== 'approved')
      await this.sendGuestEmail('accepted', after, guestId)
    if (update.offerSpot) await this.sendGuestEmail('spot_offered', after, guestId)
    if (update.withdrawOffer) await this.sendGuestEmail('offer_withdrawn', after, guestId)
    return after
  }

  /** An email to a guest about a step on their trip, built from Trip Control's data as their join page would show it. */
  private async sendGuestEmail(kind: string, trip: OrganizerTrip, guestId: string): Promise<void> {
    const me = trip.guests.find((g) => g.id === guestId)
    if (!me) return
    const room = me.roomId
      ? await this.prisma.room.findFirst({
          where: { id: me.roomId },
          select: { id: true, name: true },
        })
      : null
    await this.emails.sendToGuest(
      kind,
      { trip: { ...trip, rooms: room ? [room] : [] }, me },
      {
        email: me.email,
        phone: me.phone,
        paymentMethods: trip.paymentMethods,
        paymentInstructions: trip.paymentInstructions,
        replyTo: (await this.organizerContact(trip.id))?.email || undefined,
      },
      (process.env.FRONTEND_URL ?? 'http://localhost:5173').split(',')[0].trim()
    )
  }

  /**
   * The organizer decides a reported payment: it arrived (what the guest said they sent, unless they say otherwise), it
   * didn't, or undo that. On a first come trip a payment that pays the spot takes the next one. One transfer for several
   * travelers is decided as one (owner's decision, 2026-10-28), with what arrived for each when it differs.
   */
  async decidePayment(
    id: string,
    paymentId: string,
    decision: PaymentDecision,
    caller: Caller
  ): Promise<OrganizerTrip> {
    const trip = await this.get(id, caller)
    const all = trip.guests.flatMap((guest) =>
      guest.payments.map((payment) => ({ guest, payment }))
    )
    const hit = all.find((x) => x.payment.id === paymentId)
    if (!hit) throw new NotFoundException('Payment not found')
    const transfer = hit.payment.transferId
    const group = transfer ? all.filter((x) => x.payment.transferId === transfer) : [hit]
    const confirmed = decision.status === 'confirmed'
    if (decision.shares) {
      const ids = new Set(decision.shares.map((x) => x.paymentId))
      if (ids.size !== group.length || group.some((x) => !ids.has(x.payment.id)))
        throw new BadRequestException('Say what arrived for each person this payment was for')
    }
    if (group.length > 1 && decision.receivedPaymentAmount !== undefined)
      throw new BadRequestException('Say what arrived for each person this payment was for')
    const receivedFor = (p: Payment) =>
      confirmed
        ? (decision.shares?.find((x) => x.paymentId === p.id)?.receivedPaymentAmount ??
          decision.receivedPaymentAmount ??
          p.guestPaymentAmount)
        : null
    // The same decision again changes nothing, except correcting what arrived on a confirmed payment.
    const changes = group.filter(
      ({ payment }) =>
        !(
          decision.status === payment.status &&
          !(confirmed && receivedFor(payment) !== payment.receivedPaymentAmount)
        )
    )
    if (changes.length === 0) return trip
    for (const { guest, payment } of changes) {
      if (payment.status === 'refunded') throw new BadRequestException('That payment was refunded')
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
    }
    await this.prisma.$transaction(async (tx) => {
      for (const { payment } of changes)
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: decision.status,
            receivedPaymentAmount: receivedFor(payment),
            decidedAt: decision.status === 'reported' ? null : new Date(),
            decidedByUserId: decision.status === 'reported' ? null : caller.userId,
          },
        })
    })
    if (confirmed) for (const { guest } of changes) await this.firstComeAccept(id, guest.id, caller)
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
   * The organizer puts a credit or charge on a guest's balance, with a reason (issue #17), once they've agreed it
   * outside the app. The signed price stays as signed. A credit can't take the balance below what was paid or is
   * waiting to be confirmed, so the books never owe a guest money by accident.
   */
  async addAdjustment(
    id: string,
    guestId: string,
    input: BalanceAdjustmentInput,
    caller: Caller
  ): Promise<OrganizerTrip> {
    const trip = await this.get(id, caller)
    const guest = trip.guests.find((g) => g.id === guestId)
    if (!guest) throw new NotFoundException('Guest not found')
    if (guest.status === 'declined')
      throw new BadRequestException(`${guest.firstName} was turned down`)
    if (!guest.terms)
      throw new BadRequestException(`${guest.firstName} hasn’t signed the trip agreement`)
    if (input.kind === 'credit') this.creditFits(guest, input.amountCents)
    await this.leftToPay(guest, () =>
      this.prisma.balanceAdjustment.create({
        data: { tripId: id, guestId, ...input, createdByUserId: caller.userId },
      })
    )
    // A credit can pay the spot with what already arrived.
    await this.firstComeAccept(id, guestId, caller)
    return this.get(id, caller)
  }

  /**
   * Settles what a guest's room costs beyond what they signed (issue #30): as a charge or credit for the difference,
   * or left as it is. Either way Trip Control stops asking until they move to a room priced differently again.
   */
  async settleRoomPrice(
    id: string,
    guestId: string,
    adjust: boolean,
    caller: Caller
  ): Promise<OrganizerTrip> {
    const trip = await this.get(id, caller)
    const guest = trip.guests.find((g) => g.id === guestId)
    if (!guest) throw new NotFoundException('Guest not found')
    const diff = guest.roomPriceDiffCents
    if (diff === 0 || !guest.terms) return trip
    const room = await this.prisma.room.findFirst({ where: { id: guest.roomId ?? '', tripId: id } })
    if (!room) return trip
    const price = room.priceCents ?? trip.costPerPersonCents
    if (adjust)
      await this.addAdjustment(
        id,
        guestId,
        {
          kind: diff > 0 ? 'charge' : 'credit',
          amountCents: Math.abs(diff),
          reason: `${room.name} costs ${money(price)} a person`,
        },
        caller
      )
    await this.prisma.guest.update({
      where: { id: guestId },
      data: { roomPriceSettledCents: price },
    })
    return this.get(id, caller)
  }

  /** Takes an adjustment back: it stays on record, marked removed, and no longer counts. Never edited. */
  async removeAdjustment(id: string, adjustmentId: string, caller: Caller): Promise<OrganizerTrip> {
    const trip = await this.get(id, caller)
    const guest = trip.guests.find((g) => g.adjustments.some((a) => a.id === adjustmentId))
    const adjustment = guest?.adjustments.find((a) => a.id === adjustmentId)
    if (!guest || !adjustment) throw new NotFoundException('Adjustment not found')
    if (adjustment.removedAt) return trip
    // Taking a charge off lowers the balance the way a credit does.
    if (adjustment.kind === 'charge') this.creditFits(guest, adjustment.amountCents)
    // Removed already (two clicks, or another organizer a moment ago): nothing more to do.
    await this.leftToPay(guest, () =>
      this.prisma.balanceAdjustment.updateMany({
        where: { id: adjustmentId, removedAt: null },
        data: { removedAt: new Date(), removedByUserId: caller.userId },
      })
    )
    await this.firstComeAccept(id, guest.id, caller)
    return this.get(id, caller)
  }

  /** The database checks the balance again with the guest's row locked: a payment reported a moment ago counts. */
  private async leftToPay(guest: Guest, write: () => Promise<unknown>): Promise<void> {
    try {
      await write()
    } catch (err) {
      if (!/more_than_left/.test(String(err))) throw err
      throw new BadRequestException(`That’s more than ${guest.firstName} has left to pay`)
    }
  }

  /** Lowering a guest's balance by `cents` must leave at least what they paid or reported. */
  private creditFits(guest: Guest, cents: number): void {
    if (!guest.terms) return
    const left = totalDueCents(guest.terms) - guest.terms.paidCents - guest.terms.pendingCents
    if (cents > left)
      throw new BadRequestException(
        left > 0
          ? `That’s more than the ${money(left)} ${guest.firstName} has left to pay`
          : `${guest.firstName} has nothing left to pay`
      )
  }

  /**
   * First come, first served: once confirmed payments pay a waiting guest's spot, they take the next one, in the order
   * spots were paid. When another organizer took the last spot a moment ago, the payment stays recorded and the guest
   * waits (they are the one refunded).
   */
  /**
   * A forwarded receipt confirmed a payment as trusted work (receipts/forwarded-receipts.service.ts): on a first come
   * trip it takes the next spot as an organizer's confirmation would. No person acts, so the guest's history says the
   * system accepted them.
   */
  async firstComeAcceptAsSystem(id: string, guestId: string): Promise<void> {
    await runAsSystem(() => this.firstComeAccept(id, guestId, { userId: '', isAdmin: false }, true))
  }

  private async firstComeAccept(
    id: string,
    guestId: string,
    caller: Caller,
    anyTrip = false
  ): Promise<void> {
    const trip = await this.get(id, caller, anyTrip)
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
      return
    }
    await this.sendGuestEmail('accepted', await this.get(id, caller, anyTrip), guestId)
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
    if (trip.deletedAt) throw new BadRequestException('This trip is deleted')
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
    // Who looks after a guest (issue #11): the database's own checks, for a change that raced another.
    if (/manager_not_on_trip/.test(String(err)))
      throw new BadRequestException('Pick a guest on this trip who signed in to join')
    if (/Guest_tripId_email_key/.test(String(err)))
      throw new ConflictException(
        'That guest shares an email with another guest. Change one of them first.'
      )
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
    deletedAt: Date | null
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
        // Deleted: when it's erased (Your trips offers Restore until then; the Admin toolbox shows it).
        eraseOn: row.deletedAt ? eraseOn(row.deletedAt) : null,
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

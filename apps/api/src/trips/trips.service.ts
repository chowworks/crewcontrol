import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import type { Caller } from '../auth/caller'
import { runAsSystem } from '../core/tenant-context'
import { PrismaService, rlsActive } from '../prisma/prisma.service'
import { toOrganizerTrip, toPublicTrip, toTripSummary, type PublicGuestRow } from './trip-mapper'
import type {
  BedType,
  GuestUpdate,
  OrganizerTrip,
  PublicTrip,
  RegistrationInput,
  TripInput,
  TripRoom,
  TripSummary,
} from './trip-types'
import { splitName } from './trip-input'
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
  guests: { orderBy: { createdAt: 'asc' } },
  rooms: { orderBy: { position: 'asc' } },
} satisfies Prisma.TripInclude

function data(input: TripInput) {
  return {
    ...input,
    photos: input.photos as unknown as Prisma.InputJsonValue,
    highlights: input.highlights as unknown as Prisma.InputJsonValue,
    keyDates: input.keyDates as unknown as Prisma.InputJsonValue,
  }
}

@Injectable()
export class TripsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The trips the caller works on (their TripMember rows). Row-level security draws the same line in the database;
   * the filter here keeps it while the API still connects as the owner. Admins see every trip in the Admin toolbox.
   */
  async list(caller: Caller): Promise<TripSummary[]> {
    const rows = await this.prisma.trip.findMany({
      where: { members: { some: { userId: caller.userId } } },
      orderBy: { startDate: 'asc' },
    })
    return rows.map(toTripSummary)
  }

  /** A trip the caller works on; anyone else's reads as not found. An admin seats itself first (Admin toolbox). */
  async get(id: string, caller: Caller): Promise<OrganizerTrip> {
    const row = await this.prisma.trip.findFirst({
      where: { id, members: { some: { userId: caller.userId } } },
      include: withGuests,
    })
    if (!row) throw new NotFoundException('Trip not found')
    return toOrganizerTrip(row)
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
    return toOrganizerTrip(row)
  }

  async update(
    id: string,
    input: TripInput,
    caller: Caller,
    slug?: string
  ): Promise<OrganizerTrip> {
    await this.get(id, caller)
    const row = await uniqueSlug(() =>
      this.prisma.trip.update({
        where: { id },
        data: slug ? { ...data(input), slug } : data(input),
        include: withGuests,
      })
    )
    return toOrganizerTrip(row)
  }

  /** The seed's demo trips, for the homepage. Real organizers' trips are never listed publicly. */
  async listSamples(): Promise<TripSummary[]> {
    const rows = await this.prisma.trip.findMany({
      where: { isSample: true, published: true },
      orderBy: { createdAt: 'asc' },
    })
    return rows.map(toTripSummary)
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
    const [{ spots }] = await this.prisma.$queryRaw<{ spots: number }[]>(
      Prisma.sql`SELECT "public_spots_taken"(${row.id}) AS spots`
    )
    return toPublicTrip({
      ...row,
      guests,
      roomTaken: new Map(taken.map((t) => [t.roomId, t.taken])),
      spotsTaken: spots,
    })
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

  /**
   * A guest registers interest from the trip page, as a public page: it reads no guest row (the database answers
   * the two questions it needs) and writes the sign-up with createMany, which reads nothing back. Pay-first trips
   * need the guest to confirm the first payment.
   */
  async register(slug: string, input: RegistrationInput): Promise<{ status: 'interested' }> {
    const trip = await this.prisma.trip.findUnique({ where: { slug } })
    if (!trip || !trip.published) throw new NotFoundException('Trip not found')
    if (trip.payFirst && !input.paymentSent)
      throw new BadRequestException('Confirm you’ve sent your first payment to register')
    if (input.roomId) {
      const room = await this.prisma.room.findFirst({
        where: { id: input.roomId, tripId: trip.id },
      })
      if (!room) throw new BadRequestException('That room is not on this trip')
    }
    const [firstName, lastName] = splitName(input.name)
    // One step the database checks: a repeat email is skipped (the reply is the same either way, so the page never
    // says who has signed up), and the room trigger refuses a room with no place left (Guest_5_room_fits).
    await roomFull(() =>
      this.prisma.guest.createMany({
        skipDuplicates: true,
        data: {
          tripId: trip.id,
          firstName,
          lastName,
          email: input.email,
          phone: input.phone,
          // Only a pay-first trip asks for the first payment before sign-up.
          paymentSentAt: trip.payFirst && input.paymentSent ? new Date() : null,
          roomId: input.roomId ?? null,
          roomNote: input.roomNote ?? '',
        },
      })
    )
    return { status: 'interested' }
  }

  /** The organizer approves a guest or confirms their payment arrived (which sets their place in line). */
  async updateGuest(
    id: string,
    guestId: string,
    update: GuestUpdate,
    caller: Caller
  ): Promise<OrganizerTrip> {
    await this.get(id, caller)
    const guest = await this.prisma.guest.findFirst({ where: { id: guestId, tripId: id } })
    if (!guest) throw new NotFoundException('Guest not found')
    if (update.roomId) {
      const room = await this.prisma.room.findFirst({ where: { id: update.roomId, tripId: id } })
      if (!room) throw new BadRequestException('That room is not on this trip')
    }
    await roomFull(() =>
      this.prisma.guest.update({
        where: { id: guestId },
        data: {
          ...(update.status ? { status: update.status } : {}),
          ...(update.roomId === undefined ? {} : { roomId: update.roomId }),
          ...(update.paymentConfirmed === undefined
            ? {}
            : {
                paymentConfirmedAt: update.paymentConfirmed
                  ? (guest.paymentConfirmedAt ?? new Date())
                  : null,
              }),
        },
      })
    )
    return this.get(id, caller)
  }

  /**
   * Every trip, for the Admin toolbox: its owners' user ids and its going and interested counts. The admin's mark
   * reads every trip and its people but no guest row, so the counts come from the database (admin_trip_counts).
   */
  async listAll() {
    const rows = await this.prisma.trip.findMany({
      orderBy: { startDate: 'asc' },
      include: { members: { where: { role: 'owner' }, select: { userId: true } } },
    })
    // Connected as the owner (row-level security off) the admin mark isn't set, so count directly.
    const counts = rlsActive()
      ? await this.prisma.$queryRaw<{ tripId: string; going: number; interested: number }[]>(
          Prisma.sql`SELECT * FROM "admin_trip_counts"()`
        )
      : (
          await this.prisma.guest.groupBy({ by: ['tripId', 'status'], _count: { _all: true } })
        ).reduce<{ tripId: string; going: number; interested: number }[]>((out, g) => {
          let c = out.find((x) => x.tripId === g.tripId)
          if (!c) out.push((c = { tripId: g.tripId, going: 0, interested: 0 }))
          if (g.status === 'approved') c.going += g._count._all
          else c.interested += g._count._all
          return out
        }, [])
    return rows.map(({ members, ...row }) => {
      const c = counts.find((x) => x.tripId === row.id) ?? { going: 0, interested: 0 }
      return {
        ...toTripSummary(row),
        ownerIds: members.map((m) => m.userId),
        guestCount: c.going + c.interested,
        goingCount: c.going,
        interestedCount: c.interested,
        maxGuests: row.maxGuests,
        payFirst: row.payFirst,
      }
    })
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
async function roomFull<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write()
  } catch (err) {
    const name = /room_full:([^"\n]*)/.exec(String((err as Error).message))?.[1]
    if (name !== undefined)
      throw new ConflictException(`${name.trim()} is full. Pick another room.`)
    if (/That room is not on this trip/.test(String((err as Error).message)))
      throw new BadRequestException('That room is not on this trip')
    throw err
  }
}

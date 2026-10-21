import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { runAsSystem, tenantContext } from '../core/tenant-context'
import { PrismaService, rlsActive } from '../prisma/prisma.service'
import { toOrganizerTrip, toPublicTrip, toTripSummary, type PublicGuestRow } from './trip-mapper'
import type { OrganizerTrip, PublicTrip, TripInput, TripSummary } from './trip-types'
import { makeSlug } from './slug'

const withGuests = { guests: { orderBy: { createdAt: 'asc' } } } satisfies Prisma.TripInclude

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

  async list(): Promise<TripSummary[]> {
    const rows = await this.prisma.trip.findMany({ orderBy: { startDate: 'asc' } })
    return rows.map(toTripSummary)
  }

  async get(id: string): Promise<OrganizerTrip> {
    const row = await this.prisma.trip.findUnique({ where: { id }, include: withGuests })
    if (!row) throw new NotFoundException('Trip not found')
    return toOrganizerTrip(row)
  }

  /**
   * A new trip and its owner, the signed-in caller, as one trusted step: under row-level security nobody may create
   * a trip on their own, because its creator cannot see it until their owner row exists (docs/tenant-isolation.md).
   */
  async create(input: TripInput): Promise<OrganizerTrip> {
    const userId = tenantContext()?.userId
    // Under row-level security a trip with no owner is invisible to everyone but the admin, so it needs a caller.
    if (!userId && rlsActive()) throw new UnauthorizedException('Sign in to create a trip')
    const row = await runAsSystem(() =>
      this.prisma.$transaction(async (tx) => {
        const trip = await tx.trip.create({
          data: { ...data(input), slug: makeSlug(input.name) },
          include: withGuests,
        })
        if (userId) await tx.tripMember.create({ data: { tripId: trip.id, userId, role: 'owner' } })
        return trip
      })
    )
    return toOrganizerTrip(row)
  }

  async update(id: string, input: TripInput): Promise<OrganizerTrip> {
    await this.get(id)
    const row = await this.prisma.trip.update({
      where: { id },
      data: data(input),
      include: withGuests,
    })
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

  /** Only published trips are visible to guests; a draft reads as not found. */
  async getPublic(slug: string): Promise<PublicTrip> {
    const row = await this.prisma.trip.findUnique({ where: { slug } })
    if (!row || !row.published) throw new NotFoundException('Trip not found')
    // Never the guest rows themselves: the database hands a public page only what it may show of them.
    const guests = await this.prisma.$queryRaw<PublicGuestRow[]>(
      Prisma.sql`SELECT * FROM "public_trip_guests"(${row.id})`
    )
    return toPublicTrip({ ...row, guests })
  }
}

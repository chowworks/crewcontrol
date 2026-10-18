import { Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { toOrganizerTrip, toPublicTrip, toTripSummary } from './trip-mapper'
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

  async create(input: TripInput): Promise<OrganizerTrip> {
    const row = await this.prisma.trip.create({
      data: { ...data(input), slug: makeSlug(input.name) },
      include: withGuests,
    })
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

  /** Only published trips are visible to guests; a draft reads as not found. */
  async getPublic(slug: string): Promise<PublicTrip> {
    const row = await this.prisma.trip.findUnique({ where: { slug }, include: withGuests })
    if (!row || !row.published) throw new NotFoundException('Trip not found')
    return toPublicTrip(row)
  }
}

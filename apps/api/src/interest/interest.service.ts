import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import type { TripInterest as Row } from '@prisma/client'
import type { Caller } from '../auth/caller'
import { ClerkService } from '../auth/clerk.service'
import { runAsPublic } from '../core/tenant-context'
import { dateRange } from '../messaging/email-context'
import { EmailsService } from '../messaging/emails.service'
import { PrismaService } from '../prisma/prisma.service'
import { splitName } from '../trips/trip-input'
import type {
  InterestInput,
  InterestTold,
  InterestedPerson,
  MyInterest,
  OpenSignupsResult,
} from '../trips/trip-types'
import { TripsService } from '../trips/trips.service'

const webUrl = () => (process.env.FRONTEND_URL ?? 'http://localhost:5173').split(',')[0].trim()

/**
 * Save the date's interest list (issue #47; owner's decisions, 2026-10-31). While a trip is a save the date, a
 * signed-in person says "I'm interested" on its page, and takes themselves off whenever they like. The trip's
 * organizers see the list in Trip Control, remove people, and once sign-ups are open email everyone not yet signed up
 * that they are. Organizers work as members of the trip; a person as themselves, whom row-level security keeps to their
 * own entry (migration 20261031080000_trip_interest). Nothing here reaches the public trip page.
 */
@Injectable()
export class InterestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly trips: TripsService,
    private readonly clerk: ClerkService,
    private readonly emails: EmailsService
  ) {}

  /** Trip Control's Interested list, oldest first, each marked once they've signed up themselves. */
  async forTrip(id: string, caller: Caller): Promise<InterestedPerson[]> {
    const trip = await this.trips.get(id, caller)
    const rows = await this.prisma.tripInterest.findMany({
      where: { tripId: id },
      orderBy: { createdAt: 'asc' },
    })
    const signed = await this.signedUserIds(trip.id, rows)
    return rows.map((r) => ({
      id: r.id,
      firstName: r.firstName,
      lastName: r.lastName,
      email: r.email,
      phone: r.phone,
      createdAt: r.createdAt.toISOString(),
      signed: signed.has(r.userId),
      toldAt: r.toldAt?.toISOString() ?? null,
    }))
  }

  /** Takes someone off the list. They aren't told. */
  async remove(id: string, interestId: string, caller: Caller): Promise<InterestedPerson[]> {
    await this.trips.get(id, caller)
    await this.prisma.tripInterest.deleteMany({ where: { id: interestId, tripId: id } })
    return this.forTrip(id, caller)
  }

  /**
   * "Launch Trip Sign-Ups", the save the date's action in Trip Control (owner's decision, 2026-10-31): the trip page takes
   * sign-ups from now on, and, when the organizer leaves the box ticked, everyone interested is emailed that it does.
   */
  async openSignups(id: string, email: boolean, caller: Caller): Promise<OpenSignupsResult> {
    const trip = await this.trips.get(id, caller)
    if (!trip.saveTheDate) throw new ConflictException('Sign-ups are already open.')
    if (!trip.published)
      throw new ConflictException('Publish the trip first, then launch sign-ups.')
    await this.prisma.trip.update({ where: { id }, data: { saveTheDate: false } })
    const { told } = email ? await this.tell(id, caller) : { told: 0 }
    return { trip: await this.trips.get(id, caller), told }
  }

  /**
   * "Sign-ups are open", to everyone on the list who hasn't signed up or been told yet, with Reply-To the organizer who
   * pressed it. Only once sign-ups are open.
   */
  async tell(id: string, caller: Caller): Promise<InterestTold> {
    const trip = await this.trips.get(id, caller)
    if (trip.saveTheDate) throw new ConflictException('Open sign-ups first, then email them.')
    if (!trip.published) throw new ConflictException('Publish the trip first, then email them.')
    const rows = await this.prisma.tripInterest.findMany({
      where: { tripId: id, toldAt: null },
      orderBy: { createdAt: 'asc' },
    })
    const signed = await this.signedUserIds(id, rows)
    const me = await this.clerk.contact(caller.userId)
    let told = 0
    for (const r of rows.filter((x) => !signed.has(x.userId))) {
      const sent = await this.emails.sendSignupsOpen(
        {
          firstName: r.firstName,
          tripName: trip.name,
          dates: dateRange(trip.startDate, trip.endDate),
          organizerName: trip.organizerName,
          link: `${webUrl()}/t/${trip.slug}/join`,
        },
        r.email,
        me.email || undefined,
        id
      )
      if (!sent) continue
      await this.prisma.tripInterest.update({ where: { id: r.id }, data: { toldAt: new Date() } })
      told++
    }
    return { told }
  }

  /** Whether the signed-in caller is on a published trip's list. */
  async mine(slug: string, caller: Caller): Promise<MyInterest> {
    const trip = await this.published(slug)
    const row = await this.prisma.tripInterest.findFirst({
      where: { tripId: trip.id, userId: caller.userId },
    })
    return {
      onList: row !== null,
      createdAt: row?.createdAt.toISOString() ?? null,
      name: row ? `${row.firstName} ${row.lastName}`.trim() : '',
      phone: row?.phone ?? '',
    }
  }

  /** "I'm interested": on a save the date only, with their sign-in's email. Saying it twice changes nothing. */
  async add(slug: string, input: InterestInput, caller: Caller): Promise<MyInterest> {
    const trip = await this.published(slug)
    if (!trip.saveTheDate)
      throw new ConflictException('Sign-ups for this trip are open. Sign up instead.')
    const existing = await this.mine(slug, caller)
    if (existing.onList) return existing
    const { email } = await this.clerk.contact(caller.userId)
    if (!email)
      throw new ConflictException('Your sign-in has no email address. Add one, then try again.')
    const [firstName, lastName] = splitName(input.name)
    await this.prisma.tripInterest.create({
      data: {
        tripId: trip.id,
        userId: caller.userId,
        firstName,
        lastName,
        email,
        phone: input.phone,
      },
    })
    return this.mine(slug, caller)
  }

  /** "Take me off the list". */
  async leave(slug: string, caller: Caller): Promise<MyInterest> {
    const trip = await this.published(slug)
    await this.prisma.tripInterest.deleteMany({ where: { tripId: trip.id, userId: caller.userId } })
    return { onList: false, createdAt: null, name: '', phone: '' }
  }

  /** Of these people, the ones with a place of their own on the trip: they signed up with the same sign-in. */
  private async signedUserIds(tripId: string, rows: Row[]): Promise<Set<string>> {
    if (rows.length === 0) return new Set()
    const guests = await this.prisma.guest.findMany({
      where: { tripId, userId: { in: rows.map((r) => r.userId) } },
      select: { userId: true },
    })
    return new Set(guests.map((g) => g.userId!))
  }

  /** A published trip by its link, read as its public page, or not found. */
  private async published(slug: string) {
    const trip = await runAsPublic(() =>
      this.prisma.trip.findUnique({
        where: { slug },
        select: { id: true, published: true, saveTheDate: true, deletedAt: true },
      })
    )
    if (!trip?.published || trip.deletedAt) throw new NotFoundException('Trip not found')
    return trip
  }
}

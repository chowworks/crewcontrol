import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import type { Caller } from '../auth/caller'
import { ClerkService } from '../auth/clerk.service'
import { runAsSystem } from '../core/tenant-context'
import { dateRange } from '../messaging/email-context'
import { EmailsService } from '../messaging/emails.service'
import { PrismaService } from '../prisma/prisma.service'
import type { TripPeople, TripPersonInput, TripRole } from './trip-types'

/**
 * A trip's People screen: who runs it (its TripMember rows), and its owners (or the admin, from the Admin toolbox)
 * adding, changing and removing them by email. Someone who hasn't signed in yet is invited (TripInvite) and joins
 * with that role when they first sign in with that email (`claimInvites`). The database draws the same line
 * (TripMember and TripInvite policies) and logs changes to the trip's people (TripMember_9_admin_logged); `admin` is
 * true only on the admin's routes, where the guard set its mark.
 */
@Injectable()
export class PeopleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clerk: ClerkService,
    private readonly emails: EmailsService
  ) {}

  async list(tripId: string, caller: Caller, admin: boolean): Promise<TripPeople> {
    const trip = await this.trip(tripId, caller, admin)
    const found = await this.clerk.people(trip.members.map((m) => m.userId))
    const order = (r: string) => (r === 'owner' ? 0 : 1)
    return {
      tripName: trip.name,
      isSample: trip.isSample,
      canManage: admin || this.isOwner(trip, caller),
      people: trip.members
        .map((m) => ({
          userId: m.userId,
          name: found.get(m.userId)?.name ?? 'Unknown',
          email: found.get(m.userId)?.email ?? '',
          role: m.role as TripRole,
        }))
        .sort((a, b) => order(a.role) - order(b.role) || a.name.localeCompare(b.name)),
      invites: trip.invites.map((i) => ({ email: i.email, role: i.role as TripRole })),
    }
  }

  async add(tripId: string, input: TripPersonInput, caller: Caller, admin: boolean) {
    const trip = await this.managed(tripId, caller, admin, input.role)
    if (trip.invites.some((i) => i.email === input.email))
      throw new ConflictException('They are already invited.')
    const userId = await this.clerk.userIdByEmail(input.email)
    if (userId && trip.members.some((m) => m.userId === userId))
      throw new ConflictException('They already help run this trip.')
    let added = true
    try {
      // Someone who hasn't signed in yet is invited, and joins when they first sign in with this email.
      if (userId)
        await this.prisma.tripMember.create({ data: { tripId, userId, role: input.role } })
      else
        await this.prisma.tripInvite.create({
          data: { tripId, email: input.email, role: input.role, invitedBy: caller.userId },
        })
    } catch (err) {
      // A double click: the other request added them first.
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err
      added = false
    }
    // Not when an admin seats themselves, nor on Undo, which puts back someone who was already told.
    if (added && input.notify !== false && userId !== caller.userId)
      await this.sendInvite(trip, input, Boolean(userId), tripId, caller)
    return this.list(tripId, caller, admin)
  }

  /** The "invite" email (issue #12): the Control panel for someone with an account, sign-up for someone new. */
  private async sendInvite(
    trip: { name: string; destination: string; startDate: string; endDate: string },
    input: TripPersonInput,
    signedUp: boolean,
    tripId: string,
    caller: Caller
  ): Promise<void> {
    const by = await this.clerk.contact(caller.userId)
    const web = (process.env.FRONTEND_URL ?? 'http://localhost:5173').split(',')[0].trim()
    await this.emails.sendInvite(
      {
        tripName: trip.name,
        destination: trip.destination,
        dates: dateRange(trip.startDate, trip.endDate),
        inviterName: by.name || by.email || 'A Travel HQ organizer',
        role: input.role,
        isOwner: input.role === 'owner',
        email: input.email,
        signedUp,
        link: signedUp ? `${web}/organize/${tripId}/control` : `${web}/sign-up`,
      },
      by.email || undefined
    )
  }

  async setRole(tripId: string, userId: string, role: TripRole, caller: Caller, admin: boolean) {
    const trip = await this.managed(tripId, caller, admin, role)
    if (!trip.members.some((m) => m.userId === userId))
      throw new NotFoundException('Not on this trip')
    await keepsAnOwner(() =>
      this.prisma.tripMember.update({
        where: { tripId_userId: { tripId, userId } },
        data: { role },
      })
    )
    return this.list(tripId, caller, admin)
  }

  async remove(tripId: string, userId: string, caller: Caller, admin: boolean) {
    const trip = await this.managed(tripId, caller, admin)
    if (!trip.members.some((m) => m.userId === userId))
      throw new NotFoundException('Not on this trip')
    await keepsAnOwner(() =>
      this.prisma.tripMember.delete({ where: { tripId_userId: { tripId, userId } } })
    )
    // An owner who stepped down no longer sees the trip.
    if (!admin && userId === caller.userId) return null
    return this.list(tripId, caller, admin)
  }

  async setInviteRole(
    tripId: string,
    email: string,
    role: TripRole,
    caller: Caller,
    admin: boolean
  ) {
    const trip = await this.managed(tripId, caller, admin, role)
    if (!trip.invites.some((i) => i.email === email)) throw new NotFoundException('Not invited')
    await this.prisma.tripInvite.update({
      where: { tripId_email: { tripId, email } },
      data: { role },
    })
    return this.list(tripId, caller, admin)
  }

  async cancelInvite(tripId: string, email: string, caller: Caller, admin: boolean) {
    const trip = await this.managed(tripId, caller, admin)
    if (!trip.invites.some((i) => i.email === email)) throw new NotFoundException('Not invited')
    await this.prisma.tripInvite.delete({ where: { tripId_email: { tripId, email } } })
    return this.list(tripId, caller, admin)
  }

  /**
   * Turns the caller's invites into memberships: any invite to an email they verified with the sign-in provider.
   * Trusted work, because nobody may seat themselves (TripMember policies). Called when they open Your trips, so
   * the trip is there after their first sign-in.
   */
  async claimInvites(caller: Caller): Promise<void> {
    const emails = await this.clerk.verifiedEmails(caller.userId)
    if (emails.length === 0) return
    await runAsSystem(() =>
      this.prisma.$transaction(async (tx) => {
        const invites = await tx.tripInvite.findMany({ where: { email: { in: emails } } })
        for (const i of invites) {
          // Already on the trip (added by account after being invited): the invite just goes.
          const on = await tx.tripMember.findUnique({
            where: { tripId_userId: { tripId: i.tripId, userId: caller.userId } },
          })
          if (!on)
            await tx.tripMember.create({
              data: { tripId: i.tripId, userId: caller.userId, role: i.role },
            })
          await tx.tripInvite.delete({ where: { id: i.id } })
        }
      })
    )
  }

  /** The trip and its people: any trip for the admin, otherwise only one the caller helps run. */
  private async trip(tripId: string, caller: Caller, admin: boolean) {
    const trip = await this.prisma.trip.findFirst({
      where: admin
        ? { id: tripId }
        : { id: tripId, deletedAt: null, members: { some: { userId: caller.userId } } },
      select: {
        name: true,
        isSample: true,
        destination: true,
        startDate: true,
        endDate: true,
        members: { select: { userId: true, role: true } },
        invites: { select: { email: true, role: true }, orderBy: { createdAt: 'asc' } },
      },
    })
    if (!trip) throw new NotFoundException('Trip not found')
    return trip
  }

  /** The trip, for a change only its owners or the admin may make. Sample trips stay ownerless (the seed's). */
  private async managed(tripId: string, caller: Caller, admin: boolean, role?: TripRole) {
    const trip = await this.trip(tripId, caller, admin)
    if (!admin && !this.isOwner(trip, caller))
      throw new ForbiddenException('Only the trip’s owners can change who runs it.')
    if (role === 'owner' && trip.isSample)
      throw new BadRequestException('Sample trips have no owner. Add them as an organizer.')
    return trip
  }

  private isOwner(trip: { members: { userId: string; role: string }[] }, caller: Caller) {
    return trip.members.some((m) => m.userId === caller.userId && m.role === 'owner')
  }
}

/** The database keeps every trip an owner (TripMember_9_keeps_an_owner): its refusal as a 409 the screen can show. */
async function keepsAnOwner<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write()
  } catch (err) {
    if (/left with no owner/.test(String((err as Error).message)))
      throw new ConflictException('A trip needs an owner. Make someone else an owner first.')
    throw err
  }
}

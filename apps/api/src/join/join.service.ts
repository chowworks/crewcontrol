import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import type { Caller } from '../auth/caller'
import { RateLimiter } from '../core/rate-limit'
import { runAsPublic } from '../core/tenant-context'
import { PrismaService } from '../prisma/prisma.service'
import { toSignedAgreement } from '../trips/trip-mapper'
import { splitName } from '../trips/trip-input'
import type { JoinInput, JoinView, MyGuest } from '../trips/trip-types'
import { roomFull, TripsService } from '../trips/trips.service'
import { agreementPreview, refundTerms, TEMPLATE_VERSION, termsOf } from './agreement'
import { sendText } from './send-text'

/** Where guests open the web app, for links in texts: the first of FRONTEND_URL's addresses. */
// An email already on the trip, refused: three a person per trip every 10 minutes, so nobody can test one email
// after another to learn who joined.
const emailRefusals = new RateLimiter(
  3,
  10 * 60_000,
  'Too many tries. Wait a few minutes and try again.'
)

const webUrl = () => (process.env.FRONTEND_URL ?? 'http://localhost:5173').split(',')[0].trim()

/**
 * Whether a guest may see how to pay and say they did: never once turned down, and on an accept-first trip only once
 * accepted (a guest on the other two pays before the organizer decides).
 */
const canPay = (joinMode: string, status: string) =>
  status !== 'declined' && (joinMode !== 'accept_first' || status === 'approved')

/**
 * Joining a trip, for a signed-in guest: read the agreement, sign it with the form, then say they've paid. The trip
 * itself is read as a public page (a person who hasn't joined can't read the trip row); everything about the guest
 * is read and written as the guest, whom row-level security keeps to their own rows (migration
 * 20261023020000_join_and_agreements). Payment instructions reach a guest only here, once they've joined (and, on an
 * accept-first trip, once the organizer accepted them).
 */
@Injectable()
export class JoinService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly trips: TripsService
  ) {}

  async view(slug: string, caller: Caller): Promise<JoinView> {
    const trip = await runAsPublic(() => this.trips.getPublic(slug))
    const row = await this.prisma.guest.findFirst({
      where: { userId: caller.userId, trip: { slug } },
      include: { agreement: true, trip: { select: { paymentInstructions: true } } },
    })
    const me: MyGuest | null = row && {
      status: row.status as MyGuest['status'],
      firstName: row.firstName,
      lastName: row.lastName,
      paymentSentAt: row.paymentSentAt?.toISOString() ?? null,
      paymentConfirmedAt: row.paymentConfirmedAt?.toISOString() ?? null,
      refundSentAt: row.refundSentAt?.toISOString() ?? null,
      roomId: row.roomId,
      terms: row.agreement ? termsOf(row.agreement, row.paymentConfirmedAt) : null,
      agreement: row.agreement ? toSignedAgreement(row.agreement) : null,
      paymentInstructions: canPay(trip.joinMode, row.status) ? row.trip.paymentInstructions : '',
    }
    return { trip, agreement: agreementPreview(trip), me }
  }

  /** Joins the trip and signs its agreement, as one step: there is no sign-up without a signature. */
  async join(
    slug: string,
    input: JoinInput,
    caller: Caller,
    from: { ip: string; userAgent: string }
  ): Promise<JoinView> {
    const { trip, agreement, me } = await this.view(slug, caller)
    if (me) throw new ConflictException('You’ve already joined this trip')
    // Three emails refused in ten minutes: no more joining this trip until the time is up.
    emailRefusals.check(`${caller.userId}:${slug}`)
    if (input.agreementHash !== agreement.textHash)
      throw new ConflictException(
        'The trip’s details changed since you opened this page. Read the agreement again, then sign.'
      )
    if (trip.maxGuests !== null && trip.spotsTaken >= trip.maxGuests)
      throw new ConflictException('Every spot on this trip is taken')
    if (input.roomId && !trip.rooms.some((r) => r.id === input.roomId))
      throw new BadRequestException('That room is not on this trip')
    if (!input.roomId && trip.options.roomRequired && trip.rooms.length > 0)
      throw new BadRequestException('Pick a room to join')
    const { id: tripId } = await runAsPublic(() =>
      this.prisma.trip.findUniqueOrThrow({ where: { slug }, select: { id: true } })
    )
    const [firstName, lastName] = splitName(input.name)
    try {
      await roomFull(() =>
        this.prisma.$transaction(async (tx) => {
          const guest = await tx.guest.create({
            data: {
              tripId,
              userId: caller.userId,
              firstName,
              lastName,
              email: input.email,
              phone: input.phone,
              roomId: input.roomId ?? null,
              roomNote: trip.options.roomChoice ? (input.roomNote ?? '') : '',
            },
          })
          await tx.agreementSignature.create({
            data: {
              tripId,
              guestId: guest.id,
              templateVersion: TEMPLATE_VERSION,
              text: agreement.text,
              textHash: agreement.textHash,
              priceCents: trip.costPerPersonCents,
              installmentCount: trip.installmentCount,
              startDate: trip.startDate,
              endDate: trip.endDate,
              refundTerms: refundTerms(trip.organizerName, trip.joinMode),
              typedName: input.typedName,
              ipAddress: from.ip.slice(0, 64),
              userAgent: from.userAgent.slice(0, 500),
            },
          })
        })
      )
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        if (String(err.meta?.target ?? '').includes('userId'))
          throw new ConflictException('You’ve already joined this trip')
        // Never say whose email it is, stop anyone trying one email after another, and tell the organizers in the
        // trip log who tried (owner's decision, 2026-10-24).
        // The try that reaches the limit is logged as blocked; joining this trip waits out the ten minutes.
        const key = `${caller.userId}:${slug}`
        emailRefusals.hit(key)
        let blocked = false
        try {
          emailRefusals.check(key)
        } catch {
          blocked = true
        }
        await this.prisma
          .$executeRaw`SELECT "log_refused_email"(${slug}, ${input.name}, ${input.email}, ${input.phone}, ${from.ip}, ${from.userAgent}, ${blocked})`
        throw new ConflictException('This email can’t be used.')
      }
      throw err
    }
    // The copy of record (the guest's join page keeps it too). Email is mocked until slice 4.
    await sendText(
      input.phone,
      `You signed the trip agreement for ${trip.name}. ` +
        (trip.joinMode === 'accept_first'
          ? `Your copy, and how to pay ${trip.organizerName} once you're accepted: `
          : `Your copy and how to pay ${trip.organizerName}: `) +
        `${webUrl()}/t/${slug}/join`
    )
    return this.view(slug, caller)
  }

  /** The guest says they've sent their first payment. The organizer confirms it arrived. */
  async markPaid(slug: string, caller: Caller): Promise<JoinView> {
    const row = await this.prisma.guest.findFirst({
      where: { userId: caller.userId, trip: { slug } },
      include: { trip: { select: { joinMode: true } } },
    })
    if (!row) throw new NotFoundException('Join the trip first')
    if (!canPay(row.trip.joinMode, row.status))
      throw new BadRequestException('You can pay once you’re accepted')
    if (!row.paymentSentAt && !row.paymentConfirmedAt)
      await this.prisma.guest.update({ where: { id: row.id }, data: { paymentSentAt: new Date() } })
    return this.view(slug, caller)
  }
}

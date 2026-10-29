import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import type { Caller } from '../auth/caller'
import { ClerkService } from '../auth/clerk.service'
import { RateLimiter } from '../core/rate-limit'
import { runAsPublic } from '../core/tenant-context'
import { EmailsService } from '../messaging/emails.service'
import { PrismaService } from '../prisma/prisma.service'
import { TermsService } from '../terms/terms.service'
import { paymentMethodsOf, paymentsOf, toSignedAgreement } from '../trips/trip-mapper'
import { splitName } from '../trips/trip-input'
import {
  fillAgreementNames,
  paymentMethodLabel,
  type ClaimInput,
  type JoinInput,
  type JoinView,
  type MyActions,
  type MyGuest,
  type PaymentMethod,
  type PaymentReport,
} from '../trips/trip-types'
import { roomFull, TripsService } from '../trips/trips.service'
import {
  agreementPreview,
  firstInstallmentCents,
  hashOf,
  refundTerms,
  TEMPLATE_VERSION,
  termsOf,
} from './agreement'
import { canPay, owed } from './guest-pay'
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
 * Joining a trip, for a signed-in guest: read the agreement, sign it with the form, then report their payments. The trip
 * itself is read as a public page (a person who hasn't joined can't read the trip row); everything about the guest
 * is read and written as the guest, whom row-level security keeps to their own rows (migration
 * 20261023020000_join_and_agreements). Payment instructions reach a guest only here, once they've joined (and, on an
 * accept-first trip, once the organizer accepted them).
 */
@Injectable()
export class JoinService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly trips: TripsService,
    private readonly terms: TermsService,
    private readonly clerk: ClerkService,
    private readonly emails: EmailsService
  ) {}

  /**
   * The join page for the caller: their own place on the trip, and the travelers they signed up and look after (issue
   * #11). A traveler someone else signed up with one of the caller's emails is offered to them (`claimable`); it
   * becomes theirs only when they say it's them (`claim`).
   */
  async view(slug: string, caller: Caller): Promise<JoinView> {
    const trip = await runAsPublic(() => this.trips.getPublic(slug))
    const include = {
      agreement: true,
      payments: true,
      trip: { select: { paymentInstructions: true, paymentMethods: true } },
    } as const
    const where = {
      trip: { slug },
      OR: [{ userId: caller.userId }, { managedByUserId: caller.userId }],
    }
    const rows = await this.prisma.guest.findMany({ where, include, orderBy: { createdAt: 'asc' } })
    // Someone who joined themselves by mistake ("Not me") is offered the right place again once an organizer turns
    // down theirs, if nothing was paid on it (claim_managed_guest decides).
    const own = rows.find((r) => r.userId === caller.userId)
    const signedBy =
      own &&
      (own.status !== 'declined' ||
        own.payments.some((p) => ['reported', 'confirmed', 'refunded'].includes(p.status)))
        ? null
        : await this.claimable(slug, caller, false)
    const mine = (row: (typeof rows)[number]): MyGuest => {
      const payments = paymentsOf(row.payments)
      const pay = canPay(trip.joinMode, row)
      return {
        id: row.id,
        status: row.status as MyGuest['status'],
        firstName: row.firstName,
        lastName: row.lastName,
        spotPaidAt: row.spotPaidAt?.toISOString() ?? null,
        refundSentAt: row.refundSentAt?.toISOString() ?? null,
        waitlistedAt: row.waitlistedAt?.toISOString() ?? null,
        offeredAt: row.offeredAt?.toISOString() ?? null,
        roomId: row.roomId,
        terms: row.agreement ? termsOf(row.agreement, payments) : null,
        agreement: row.agreement ? toSignedAgreement(row.agreement) : null,
        payments,
        paymentMethods: pay ? paymentMethodsOf(row.trip) : [],
        paymentInstructions: pay ? row.trip.paymentInstructions : '',
      }
    }
    const facts = { ...trip, organizer: await this.trips.organizerContact(await this.tripId(slug)) }
    return {
      trip,
      agreement: agreementPreview(facts),
      agreementOnBehalf: agreementPreview(facts, true),
      me: own ? mine(own) : null,
      managed: rows.filter((r) => r !== own).map(mine),
      claimable: signedBy === null ? null : { signedBy },
      termsOfUse: await this.terms.status(caller.userId, 'use'),
    }
  }

  private async tripId(slug: string): Promise<string> {
    const { id } = await runAsPublic(() =>
      this.prisma.trip.findUniqueOrThrow({ where: { slug }, select: { id: true } })
    )
    return id
  }

  /** The name someone signed the caller up with on this trip, if any; with `take`, that place becomes theirs. */
  private async claimable(slug: string, caller: Caller, take: boolean): Promise<string | null> {
    const emails = await this.clerk.verifiedEmails(caller.userId)
    if (emails.length === 0) return null
    const [{ signer }] = await this.prisma.$queryRaw<{ signer: string | null }[]>`
      SELECT "claim_managed_guest"(${slug}, ${emails}::TEXT[], ${take}) AS signer`
    return signer
  }

  /**
   * "That's me": the caller takes over the place someone signed them up with (issue #11), accepting Travel HQ's Terms
   * of Use if they haven't. The agreement stays the one signed for them, and the person who signed still sees them.
   */
  async claim(
    slug: string,
    input: ClaimInput,
    caller: Caller,
    from: { ip: string; userAgent: string }
  ): Promise<JoinView> {
    const { me, claimable, termsOfUse } = await this.view(slug, caller)
    if (me && me.status !== 'declined')
      throw new ConflictException('You’ve already joined this trip')
    if (!claimable) throw new NotFoundException('Nobody signed you up for this trip')
    if (!termsOfUse.accepted && input.termsVersion !== termsOfUse.version)
      throw new ConflictException(
        input.termsVersion
          ? 'Travel HQ’s Terms of Use changed since you opened this page. Read them again, then try again.'
          : 'Tick the box to agree to Travel HQ’s Terms of Use.'
      )
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "claim_managed_guest"(${slug}, ${await this.clerk.verifiedEmails(caller.userId)}::TEXT[], true)`
      if (!termsOfUse.accepted) await this.terms.record(tx, caller.userId, ['use'], from)
    })
    if (!termsOfUse.accepted) this.terms.remember(caller.userId, ['use'])
    return this.view(slug, caller)
  }

  /** Joins the trip and signs its agreement, as one step: there is no sign-up without a signature. */
  async join(
    slug: string,
    input: JoinInput,
    caller: Caller,
    from: { ip: string; userAgent: string }
  ): Promise<JoinView> {
    const view = await this.view(slug, caller)
    const { trip, me, termsOfUse } = view
    const onBehalf = Boolean(input.onBehalf)
    // Someone signing up a traveler they look after signs the agreement on that traveler's behalf.
    const agreement = onBehalf ? view.agreementOnBehalf : view.agreement
    if (me && !onBehalf) throw new ConflictException('You’ve already joined this trip')
    // Three emails refused in ten minutes: no more joining this trip until the time is up.
    emailRefusals.check(`${caller.userId}:${slug}`)
    if (input.agreementHash !== agreement.textHash)
      throw new ConflictException(
        'The trip’s details changed since you opened this page. Read the agreement again, then sign.'
      )
    // Someone who hasn't accepted Travel HQ's current Terms of Use accepts them here, with the signature.
    if (!termsOfUse.accepted && input.termsVersion !== termsOfUse.version)
      throw new ConflictException(
        input.termsVersion
          ? 'Travel HQ’s Terms of Use changed since you opened this page. Read them again, then sign.'
          : 'Tick the box to agree to Travel HQ’s Terms of Use.'
      )
    // A full trip keeps taking sign-ups: the database puts them on the waitlist (guest_waitlist).
    if (input.roomId && !trip.rooms.some((r) => r.id === input.roomId))
      throw new BadRequestException('That room is not on this trip')
    if (!input.roomId && trip.options.roomRequired && trip.rooms.length > 0)
      throw new BadRequestException('Pick a room to join')
    const tripId = await this.tripId(slug)
    const [firstName, lastName] = splitName(input.name)
    // Signing for someone, the text kept names both of them, as the screen showed it (fillAgreementNames).
    const signedText = onBehalf
      ? fillAgreementNames(agreement.text, input.typedName, input.name)
      : agreement.text
    try {
      await roomFull(() =>
        this.prisma.$transaction(async (tx) => {
          const guest = await tx.guest.create({
            data: {
              tripId,
              ...(onBehalf ? { managedByUserId: caller.userId } : { userId: caller.userId }),
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
              text: signedText,
              textHash: hashOf(signedText),
              priceCents: trip.costPerPersonCents,
              installmentCount: trip.installmentCount,
              startDate: trip.startDate,
              endDate: trip.endDate,
              refundTerms: refundTerms(
                trip.organizerName,
                trip.joinMode,
                trip.refundPolicy,
                firstInstallmentCents(trip.costPerPersonCents, trip.installmentCount)
              ),
              typedName: input.typedName,
              ...(onBehalf ? { signedByUserId: caller.userId } : {}),
              ipAddress: from.ip.slice(0, 64),
              userAgent: from.userAgent.slice(0, 500),
            },
          })
          if (!termsOfUse.accepted) await this.terms.record(tx, caller.userId, ['use'], from)
        })
      )
      if (!termsOfUse.accepted) this.terms.remember(caller.userId, ['use'])
    } catch (err) {
      if (/too_many_travelers/.test(String(err)))
        throw new ConflictException('You can sign up at most 10 travelers on a trip.')
      // A traveler signed up with the email of someone who joined themselves: that person is on the trip already.
      const emailTaken = /email_taken/.test(String(err))
      if (
        emailTaken ||
        (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')
      ) {
        if (
          !emailTaken &&
          err instanceof Prisma.PrismaClientKnownRequestError &&
          String(err.meta?.target ?? '').includes('userId')
        )
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
    // The copy of record (the guest's join page keeps it too): a text (mocked) and the "joined" email, whose wording
    // the admin edits on the Emails page. Neither failing undoes the join.
    const joined = await this.view(slug, caller)
    if (onBehalf) {
      await sendText(
        input.phone,
        `${input.typedName} signed ${firstName} up for ${trip.name} and signed the trip agreement for them. ` +
          (joined.managed.at(-1)?.waitlistedAt
            ? `${firstName} is on the waitlist: ${trip.organizerName} will text if a spot opens. `
            : '') +
          `Details: ${webUrl()}/t/${slug}/join`
      )
      return joined
    }
    await sendText(
      input.phone,
      `You signed the trip agreement for ${trip.name}. ` +
        (joined.me?.waitlistedAt
          ? `The trip is full, so you're on the waitlist. ${trip.organizerName} will text you if a spot opens: `
          : trip.joinMode === 'accept_first'
            ? `Your copy, and how to pay ${trip.organizerName} once you're accepted: `
            : `Your copy and how to pay ${trip.organizerName}: `) +
        `${webUrl()}/t/${slug}/join`
    )
    // The email has the trip's payment details for every guest; its wording shows them only to one who can pay.
    const pays = (
      await this.prisma.guest.findFirst({
        where: { userId: caller.userId, trip: { slug } },
        select: { trip: { select: { paymentMethods: true, paymentInstructions: true } } },
      })
    )?.trip
    await this.emails.sendToGuest(
      'joined',
      joined,
      {
        email: input.email,
        phone: input.phone,
        paymentMethods: pays ? paymentMethodsOf(pays) : [],
        paymentInstructions: pays?.paymentInstructions ?? '',
        replyTo: (await this.trips.organizerContact(tripId))?.email || undefined,
      },
      webUrl()
    )
    return joined
  }

  /**
   * The red count for what the caller has to do: on each trip they run, what Trip Control's Actions lists; on each trip
   * they joined, a payment that is due now and not yet reported (one each).
   */
  async myActions(caller: Caller): Promise<MyActions> {
    const items: MyActions['items'] = []
    for (const [id, t] of await this.trips.actionCounts(caller))
      if (t.count > 0)
        items.push({
          href: `/organize/${id}/control`,
          name: t.name,
          count: t.count,
          as: 'organizer',
        })
    const joined = await this.prisma.guest.findMany({
      where: { OR: [{ userId: caller.userId }, { managedByUserId: caller.userId }] },
      select: { trip: { select: { slug: true } } },
    })
    // One each for the trips they're on or signed someone up for, counting the travelers they look after too.
    for (const slug of new Set(joined.map((j) => j.trip.slug))) {
      const view = await this.view(slug, caller).catch(() => null)
      if (!view) continue
      const { trip } = view
      const due = [view.me, ...view.managed].some(
        (g) => g !== null && g.terms !== null && payable(trip, g) && owed(g.terms).dueNow > 0
      )
      if (due) items.push({ href: `/t/${trip.slug}/join`, name: trip.name, count: 1, as: 'guest' })
    }
    return { total: items.reduce((n, i) => n + i.count, 0), items }
  }

  /**
   * The guest reports a payment they sent: how much, how (one of the trip's methods) and when, certifying it. Less than
   * is due now needs a note saying why. The organizer confirms what arrived. Someone who looks after other travelers
   * may send one payment for several of them, and themselves, with each one's share (issue #11): it is recorded as one
   * payment per traveler, each naming who sent it.
   */
  async reportPayment(slug: string, input: PaymentReport, caller: Caller): Promise<JoinView> {
    const { trip, me, managed } = await this.view(slug, caller)
    if (!me && managed.length === 0) throw new NotFoundException('Join the trip first')
    const shares =
      input.forGuests ?? (me ? [{ guestId: me.id, amount: input.guestPaymentAmount }] : [])
    if (shares.length === 0) throw new BadRequestException('Say who this payment is for')
    if (shares.reduce((n, x) => n + x.amount, 0) !== input.guestPaymentAmount)
      throw new BadRequestException('The amounts for each person don’t add up to the payment')
    if (new Set(shares.map((x) => x.guestId)).size !== shares.length)
      throw new BadRequestException('Name each person once')
    const travelers = [me, ...managed].filter((g): g is MyGuest => g !== null)
    // The trip's ways to pay are the same for everyone on it; any traveler who may pay has them.
    const paymentMethods = travelers.find((g) => payable(trip, g))?.paymentMethods ?? []
    // A trip that lists no ways to pay says how in its note; the payment records that.
    const method: PaymentMethod | undefined =
      input.methodIndex === null
        ? paymentMethods.length === 0
          ? { kind: 'custom', label: 'As the note says', handle: '' }
          : undefined
        : paymentMethods[input.methodIndex]
    for (const share of shares) {
      const g = travelers.find((t) => t.id === share.guestId)
      if (!g)
        throw new BadRequestException(
          'You can pay only for yourself and the travelers you signed up'
        )
      const who = g === me ? 'You' : g.firstName
      if (!payable(trip, g))
        throw new BadRequestException(
          // A guest still waiting on a trip that filled has no spot to pay for (they're owed back what they sent).
          g.status === 'interested' && trip.maxGuests !== null && trip.spotsTaken >= trip.maxGuests
            ? 'Every spot on this trip is taken'
            : g === me
              ? 'You can pay once you’re accepted'
              : `${g.firstName} can’t be paid for yet`
        )
      if (!g.terms) throw new BadRequestException(`${who} hasn’t signed the trip agreement`)
      const { left, dueNow } = owed(g.terms)
      if (share.amount > left)
        throw new BadRequestException(
          g === me
            ? 'That’s more than what’s left to pay'
            : `That’s more than ${g.firstName} has left to pay`
        )
      if (share.amount < dueNow && !input.note)
        throw new BadRequestException('Say why it’s less than what’s due')
    }
    if (!method) throw new BadRequestException('Pick how you paid')
    // Who sent it, for the organizer, when it was for someone else: the payer's own name on the trip, or the name they
    // signed that traveler up with.
    const payer = me
      ? `${me.firstName} ${me.lastName}`
      : (managed.find((g) => g.id === shares[0].guestId)?.agreement?.typedName ?? '')
    const { id: tripId } = await runAsPublic(() =>
      this.prisma.trip.findUniqueOrThrow({ where: { slug }, select: { id: true } })
    )
    // Several travelers in one transfer: the organizer confirms it once.
    const transferId = shares.length > 1 ? randomUUID() : null
    await this.prisma.$transaction(async (tx) => {
      for (const share of shares)
        await tx.payment
          .create({
            data: {
              tripId,
              guestId: share.guestId,
              guestPaymentAmount: share.amount,
              method: paymentMethodLabel(method),
              methodKind: method.kind,
              sentOn: input.sentOn,
              note: input.note,
              paidByName: share.guestId === me?.id ? '' : payer,
              transferId,
            },
          })
          .catch((err: unknown) => {
            // Another report for the same guest landed first (payment_self_limits counts them one at a time).
            if (!/more_than_left/.test(String(err))) throw err
            const g = travelers.find((t) => t.id === share.guestId)
            throw new BadRequestException(
              g && g !== me
                ? `That’s more than ${g.firstName} has left to pay`
                : 'That’s more than what’s left to pay'
            )
          })
    })
    return this.view(slug, caller)
  }
}

/** Whether a guest may be paid for now: may see how to pay, no refund sent, and not waiting on a trip that filled. */
function payable(
  trip: { joinMode: string; maxGuests: number | null; spotsTaken: number },
  g: MyGuest
): boolean {
  if (!canPay(trip.joinMode, g) || g.refundSentAt) return false
  return !(
    g.status === 'interested' &&
    trip.maxGuests !== null &&
    trip.spotsTaken >= trip.maxGuests
  )
}

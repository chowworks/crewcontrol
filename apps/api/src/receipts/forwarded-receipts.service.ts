import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common'
import { Prisma, type ForwardedReceipt } from '@prisma/client'
import type { Caller } from '../auth/caller'
import { ClerkService } from '../auth/clerk.service'
import { runAsSystem } from '../core/tenant-context'
import { PrismaService } from '../prisma/prisma.service'
import { optionsOf, paymentMethodsOf } from '../trips/trip-mapper'
import {
  DISMISS_RECEIPT_LABELS,
  DISMISS_RECEIPT_REASONS,
  PAYMENT_METHOD_KINDS,
  RECEIPTS_ADDRESS_PATTERN,
  paymentMethodLabel,
  type AdminForwardedReceipt,
  type AdminForwardedReceipts,
  type AdminReceiptsAddress,
  type DismissReceiptReason,
  type ForwardedReceiptStatus,
  type MatchReceiptInput,
  type OrganizerTrip,
  type PaymentMethod,
  type ReceiptProof,
  type PaymentMethodKind,
  type TripReceipts,
} from '../trips/trip-types'
import { TripsService } from '../trips/trips.service'
import { RETIRED, addressOf, localPart } from './forwarded-queue'
import { guestsNamed, placeReceipt, type PlaceGuest } from './place-receipt'
import { plainText, readReceipt } from './read-receipt'
import { receiptsConfig, receiptsDomain, receiptsEmail } from './receipts-config'
import { ProviderError, fetchReceivedEmail } from './resend-inbound'

/** How often the worker looks for received emails that are due, and how often old rows nobody needs are removed. */
const TICK_MS = 30_000
const PURGE_MS = 60 * 60_000
/** Minutes to wait after the 1st, 2nd, 3rd and 4th failed try; the 5th failure is final. */
export const BACKOFF_MINUTES = [1, 5, 15, 60]
export const MAX_ATTEMPTS = BACKOFF_MINUTES.length + 1
/** A row that never reached a trip, or refused, failed or dismissed, is removed after this many days. */
export const KEPT_DAYS = 30
/** How much of an email's text is kept for the organizer to read while it waits for them. */
const EXCERPT_CHARS = 1500

/** Why an email was refused before it reached a trip, in the Admin toolbox's words. */
export const NO_TRIP = 'No trip uses this address'
const STOPPED = 'Reading it stopped part way too many times'
/** What the organizer is told when the address they chose is taken: never whether it's in use or retired, or whose. */
export const ADDRESS_TAKEN = 'That address isn’t available. Choose another.'
const RESERVED = new Set([
  'admin',
  'administrator',
  'postmaster',
  'hostmaster',
  'webmaster',
  'abuse',
  'root',
  'security',
  'support',
  'noreply',
  'no-reply',
  'mailer-daemon',
  'info',
  'receipts',
])

/**
 * Claims the received emails due now, at most $1: a row waiting whose time has come, or one left "processing" by a
 * worker that stopped (its lease ran out), while it has had fewer than $2 tries. SKIP LOCKED lets several API
 * processes claim at once without taking the same row; the claim counts the try and leases the row for 15 minutes.
 * Only a row sent to this process's own receipts domain ($3) is claimed, so a laptop set up for another domain on the
 * shared dev database never takes dev's mail.
 */
const CLAIM_SQL = `UPDATE "ForwardedReceipt"
   SET "status" = 'processing', "attempts" = "attempts" + 1,
       "nextAttemptAt" = CURRENT_TIMESTAMP + interval '15 minutes', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" IN (
   SELECT "id" FROM "ForwardedReceipt"
    WHERE "status" IN ('received', 'processing') AND "nextAttemptAt" <= CURRENT_TIMESTAMP
      AND "attempts" < $2
      AND right(lower("toAddress"), length($3) + 1) = '@' || $3
    ORDER BY "nextAttemptAt"
    LIMIT $1
    FOR UPDATE SKIP LOCKED)
RETURNING *`

/** Gives up a row a stopped process left "processing" after its last try, once the lease ran out. */
const EXPIRE_SQL = `UPDATE "ForwardedReceipt"
   SET "status" = 'failed', "error" = $2, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "status" = 'processing' AND "attempts" >= $1 AND "nextAttemptAt" <= CURRENT_TIMESTAMP`

/**
 * The clean-up: rows received before $1 that never reached a trip, or were refused, failed or dismissed; never one
 * refused at a retired address (reason $2) while that address is held and not released, which the Admin toolbox
 * counts. Every term is true or false, never null, so NOT keeps every other row in the delete.
 */
const PURGE_SQL = `DELETE FROM "ForwardedReceipt" r
 WHERE r."receivedAt" < $1
   AND (r."tripId" IS NULL OR r."status" IN ('rejected', 'failed', 'dismissed'))
   AND NOT (r."tripId" IS NULL AND r."status" = 'rejected' AND r."fromAddress" IS NULL
        AND COALESCE(r."reason", '') = $2
        AND EXISTS (SELECT 1 FROM "ReceiptsAddress" a
                     WHERE a."address" = split_part(r."toAddress", '@', 1)
                       AND a."removedAt" IS NOT NULL AND a."releasedAt" IS NULL))`

/** Each retired, unreleased address's refused emails since it was retired, and when the last came. Never stored. */
const sinceRemovalSql = (only: string | null) =>
  Prisma.sql`SELECT a."id", count(r."id")::int AS "received", max(r."receivedAt") AS "last"
  FROM "ReceiptsAddress" a
  JOIN "ForwardedReceipt" r
    ON r."tripId" IS NULL AND r."status" = 'rejected' AND r."fromAddress" IS NULL AND r."reason" = ${RETIRED}
   AND split_part(r."toAddress", '@', 1) = a."address" AND r."receivedAt" >= a."removedAt"
 WHERE a."removedAt" IS NOT NULL AND a."releasedAt" IS NULL
   ${only ? Prisma.sql`AND a."id" = ${only}` : Prisma.empty}
 GROUP BY a."id"`
type Since = { id: string; received: number; last: Date | null }

/** Refused for good: written on the row, never tried again by itself. */
class Rejected extends Error {}

const methodName = (kind: PaymentMethodKind) =>
  PAYMENT_METHOD_KINDS.find((k) => k.kind === kind)?.name ?? 'Other'

/** A calendar day the email may have meant: not after the day it arrived, nor more than a year before. */
function plausibleDay(day: string | null, received: Date): string {
  const arrived = received.toISOString().slice(0, 10)
  if (!day) return arrived
  const t = Date.parse(`${day}T00:00:00Z`)
  const r = Date.parse(`${arrived}T00:00:00Z`)
  return t <= r + 86_400_000 && t >= r - 400 * 86_400_000 ? day : arrived
}

/**
 * Forwarded receipts (issue #12, "receipts@"): the queue Resend's webhook fills, the worker that turns each email into
 * a reported payment on the right guest, what an organizer does with the ones it couldn't place, the trip's address,
 * and the Admin toolbox's view of every email and address. Trusted work (runAsSystem) is kept to the worker, which
 * acts before anyone is known; everything an organizer or admin does runs as them. Nothing here sends an email or
 * moves money: it records what someone says they sent.
 */
@Injectable()
export class ForwardedReceiptsService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(ForwardedReceiptsService.name)
  private timer?: NodeJS.Timeout
  private busy = false
  private lastPurge = 0

  constructor(
    private readonly prisma: PrismaService,
    private readonly trips: TripsService,
    private readonly clerk: ClerkService
  ) {}

  onApplicationBootstrap() {
    if (!receiptsConfig() || process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID) return
    this.timer = setInterval(() => void this.tick(), TICK_MS)
    this.timer.unref()
    this.logger.log('Forwarded receipts are on: the worker checks every 30 seconds')
  }

  onModuleDestroy() {
    clearInterval(this.timer)
  }

  /** One pass: everything due, in batches, then the old rows nobody needs once an hour. Never two passes at once. */
  async tick(): Promise<void> {
    if (this.busy) return
    this.busy = true
    try {
      while ((await this.runDue()) > 0) {
        /* the next batch */
      }
      if (Date.now() - this.lastPurge > PURGE_MS) {
        const before = new Date(Date.now() - KEPT_DAYS * 86_400_000)
        await runAsSystem(() => this.prisma.$executeRawUnsafe(PURGE_SQL, before, RETIRED))
        this.lastPurge = Date.now()
      }
    } catch (e) {
      this.logger.error(`The forwarded receipts worker stopped a pass: ${(e as Error).name}`)
    } finally {
      this.busy = false
    }
  }

  // ── The worker ─────────────────────────────────────────────────────────────

  /** Claims the rows due now and works on each; how many it claimed (0: nothing was due). */
  async runDue(limit = 5): Promise<number> {
    const cfg = receiptsConfig()
    if (!cfg) return 0
    const rows = await runAsSystem(async () => {
      await this.prisma.$executeRawUnsafe(EXPIRE_SQL, MAX_ATTEMPTS, STOPPED)
      return this.prisma.$queryRawUnsafe<ForwardedReceipt[]>(
        CLAIM_SQL,
        limit,
        MAX_ATTEMPTS,
        cfg.domain
      )
    })
    for (const row of rows) await this.process(row, cfg.domain)
    return rows.length
  }

  /** One claimed row, start to end. A failure that may pass is tried again later; after five it is final. */
  async process(row: ForwardedReceipt, domain: string): Promise<void> {
    try {
      await this.handle(row, domain)
    } catch (e) {
      if (e instanceof Rejected)
        return this.settle(row.id, { status: 'rejected', reason: e.message, error: null })
      // Never the sender or the subject in the log: the row's id and what kind of failure it was.
      this.logger.warn(
        `Forwarded receipt ${row.id}: try ${row.attempts} failed (${(e as Error).name})`
      )
      const error =
        e instanceof ProviderError ? e.message.slice(0, 300) : 'Something went wrong reading it'
      if (row.attempts >= MAX_ATTEMPTS) return this.settle(row.id, { status: 'failed', error })
      const wait = BACKOFF_MINUTES[Math.max(0, row.attempts - 1)]
      return this.settle(row.id, {
        status: 'received',
        error,
        nextAttemptAt: new Date(Date.now() + wait * 60_000),
      })
    }
  }

  /** Ends a claimed row's try; never one already recorded, which a late failure must not reopen. */
  private async settle(id: string, data: Prisma.ForwardedReceiptUncheckedUpdateManyInput) {
    await runAsSystem(() =>
      this.prisma.forwardedReceipt.updateMany({ where: { id, status: 'processing' }, data })
    )
  }

  /** Whose address, who sent it, what it says, and where it goes. All trusted work: nobody is known yet. */
  private async handle(row: ForwardedReceipt, domain: string): Promise<void> {
    const local = localPart(row.toAddress, domain)
    const trip = local
      ? await runAsSystem(() =>
          this.prisma.trip.findFirst({
            where: { receiptsAddress: local },
            include: {
              members: { select: { userId: true } },
              payerAddresses: { select: { address: true, guestId: true } },
              guests: {
                include: {
                  payments: { select: { guestPaymentAmount: true, sentOn: true, status: true } },
                },
              },
            },
          })
        )
      : null
    if (!trip || !local) {
      // Queued while the address was still a trip's, worked on after it changed: refused as no longer in use.
      const retired = local
        ? await runAsSystem(() =>
            this.prisma.receiptsAddress.findFirst({
              where: { address: local, removedAt: { not: null }, releasedAt: null },
              select: { id: true },
            })
          )
        : null
      throw new Rejected(retired ? RETIRED : NO_TRIP)
    }
    // Arrived before this trip took the address (released since and chosen again): it was meant for the trip before.
    const held = await runAsSystem(() =>
      this.prisma.receiptsAddress.findFirst({
        where: { tripId: trip.id, address: local, removedAt: null },
        select: { firstUsedAt: true },
      })
    )
    if (held && held.firstUsedAt > row.receivedAt) throw new Rejected(RETIRED)

    const email = await fetchReceivedEmail(row.emailId)
    const text = plainText(email.text, email.html)
    const read = readReceipt(text, email.subject ?? row.subject)
    const from = addressOf(email.from) ?? row.fromAddress
    const verified = email.authentication?.dmarc === 'pass'
    const rememberedGuestId =
      trip.payerAddresses.find((p) => p.address === from?.toLowerCase())?.guestId ?? null
    const sender = {
      address: from,
      verified,
      rememberedGuestId,
      ...(await this.whoIs(from, trip.members)),
    }
    const placement = placeReceipt(read, sender, trip.guests as PlaceGuest[], trip.joinMode)
    const parsed = {
      tripId: placement.kind === 'rejected' ? null : trip.id,
      fromAddress: from,
      subject: (email.subject ?? row.subject)?.slice(0, 300) ?? null,
      senderVerified: verified,
      amountCents: read.amountCents,
      payerName: (read.payerName || read.payeeName).slice(0, 100),
      methodKind: read.methodKind,
      sentOn: read.sentOn ? plausibleDay(read.sentOn, row.receivedAt) : null,
      error: null,
    }
    if (placement.kind === 'rejected') throw new Rejected(placement.reason)
    if (placement.kind === 'unmatched') {
      await this.settle(row.id, {
        ...parsed,
        status: 'unmatched',
        reason: placement.reason,
        suggestedGuestId: placement.suggestedGuestId,
        excerpt: text.slice(0, EXCERPT_CHARS),
      })
      return
    }
    const guest = trip.guests.find((g) => g.id === placement.guestId)!
    const sentOn = plausibleDay(read.sentOn, row.receivedAt)
    // Someone else's name on a payment for this guest (a parent paying for a child) is who sent it.
    const paidBy =
      read.payerName && guestsNamed(read.payerName, [guest]).length === 0 ? read.payerName : ''
    // An organizer's own forward is confirmed as it arrives; a guest's only where the trip says so (owner's decisions,
    // 2026-10-29). Otherwise it is the guest's reported payment, for the organizer to confirm as any other.
    const confirm = sender.organizer || optionsOf(trip).confirmReceipts
    await runAsSystem(() =>
      this.prisma.$transaction(async (tx) => {
        const payment = await tx.payment.create({
          data: {
            tripId: trip.id,
            guestId: guest.id,
            guestPaymentAmount: read.amountCents!,
            method: methodFor(paymentMethodsOf(trip), read.methodKind),
            methodKind: read.methodKind ?? 'other',
            sentOn,
            paidByName: paidBy.slice(0, 100),
            loggedBy: 'email',
            // Confirmed: no step for the organizer, who can still open it as proof and mark it not received.
            ...(confirm
              ? {
                  status: 'confirmed',
                  receivedPaymentAmount: read.amountCents!,
                  decidedAt: new Date(),
                }
              : { status: 'reported' }),
          },
        })
        await tx.forwardedReceipt.update({
          where: { id: row.id },
          data: {
            ...parsed,
            sentOn,
            status: 'recorded',
            guestId: guest.id,
            paymentId: payment.id,
            // Kept as the payment's proof, for the organizer to open from it.
            excerpt: text.slice(0, EXCERPT_CHARS),
          },
        })
      })
    )
    // On a first come trip, a payment that pays the spot takes the next one, as confirming it by hand would. The
    // payment is saved by now: a failure here is logged, never retried (that would read the receipt again).
    if (confirm)
      await this.trips
        .firstComeAcceptAsSystem(trip.id, guest.id)
        .catch((e: Error) =>
          this.logger.error(
            `Forwarded receipt ${row.id}: recorded, but giving the spot failed (${e.name})`
          )
        )
  }

  /** Whether `from` is a verified sign-in email of the trip's owners or organizers, and whose account it is. */
  private async whoIs(
    from: string | null,
    members: { userId: string }[]
  ): Promise<{ organizer: boolean; userId: string | null }> {
    if (!from) return { organizer: false, userId: null }
    for (const m of members)
      if ((await this.clerk.verifiedEmails(m.userId)).includes(from))
        return { organizer: true, userId: m.userId }
    const userId = await this.clerk.userIdByEmail(from).catch(() => null)
    // Only an address the account verified speaks for it.
    if (userId && (await this.clerk.verifiedEmails(userId)).includes(from))
      return { organizer: false, userId }
    return { organizer: false, userId: null }
  }

  // ── What the organizer does ────────────────────────────────────────────────

  /**
   * An unmatched receipt becomes the guest's reported payment, for the organizer to confirm as any other: the amount
   * and day the receipt says, unless the organizer corrected them. As the organizer, with row-level security.
   */
  async match(
    tripId: string,
    id: string,
    input: MatchReceiptInput,
    caller: Caller
  ): Promise<OrganizerTrip> {
    const trip = await this.trips.get(tripId, caller)
    const guest = trip.guests.find((g) => g.id === input.guestId)
    if (!guest) throw new NotFoundException('Guest not found')
    if (guest.status === 'declined')
      throw new BadRequestException(`${guest.firstName} was turned down`)
    const row = await this.prisma.forwardedReceipt.findFirst({ where: { id, tripId } })
    if (!row) throw new NotFoundException('Receipt not found')
    if (row.status !== 'unmatched')
      throw new ConflictException('Someone dealt with it a moment ago. Reload.')
    const kind = (row.methodKind as PaymentMethodKind | null) ?? null
    const paymentId = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          tripId,
          guestId: guest.id,
          guestPaymentAmount: input.amountCents,
          method: methodFor(trip.paymentMethods, kind),
          methodKind: kind ?? 'other',
          sentOn: input.sentOn,
          loggedBy: 'email',
        },
      })
      const { count } = await tx.forwardedReceipt.updateMany({
        where: { id, tripId, status: 'unmatched' },
        data: {
          status: 'recorded',
          guestId: guest.id,
          paymentId: payment.id,
          decidedByUserId: caller.userId,
        },
      })
      if (!count) throw new ConflictException('Someone dealt with it a moment ago. Reload.')
      // Next time, receipts from this address are filed on this guest (when its domain vouches for it).
      const address = row.fromAddress?.toLowerCase()
      if (input.remember && address)
        await tx.payerAddress.upsert({
          where: { tripId_address: { tripId, address } },
          create: { tripId, guestId: guest.id, address, createdByUserId: caller.userId },
          update: { guestId: guest.id, createdByUserId: caller.userId },
        })
      return payment.id
    })
    // The organizer says the money arrived: confirmed in the same step, as pressing Confirm would. Matched already
    // if that fails, so say so: it waits in Actions as the guest's payment.
    if (input.confirm)
      try {
        return await this.trips.decidePayment(tripId, paymentId, { status: 'confirmed' }, caller)
      } catch (e) {
        const why = e instanceof Error ? e.message : 'It could not be confirmed'
        throw new BadRequestException(
          `Matched to ${guest.firstName}, but not confirmed: ${why}. Reload to see it in Actions.`
        )
      }
    return this.trips.get(tripId, caller)
  }

  /** Stops filing receipts from an address on the guest an organizer tied it to. */
  async forgetSender(tripId: string, id: string, caller: Caller): Promise<OrganizerTrip> {
    await this.trips.get(tripId, caller)
    const { count } = await this.prisma.payerAddress.deleteMany({ where: { id, tripId } })
    if (!count) throw new NotFoundException('That address isn’t remembered')
    return this.trips.get(tripId, caller)
  }

  /** The forwarded email a payment was read from, as its proof: who sent it, when, and its text. */
  async proof(
    tripId: string,
    paymentId: string,
    caller: Caller,
    admin = false
  ): Promise<ReceiptProof> {
    await this.trips.get(tripId, caller, admin)
    const row = await this.prisma.forwardedReceipt.findFirst({ where: { tripId, paymentId } })
    if (!row) throw new NotFoundException('No forwarded receipt for that payment')
    return {
      receivedAt: row.receivedAt.toISOString(),
      fromAddress: row.fromAddress,
      subject: row.subject,
      senderVerified: row.senderVerified,
      excerpt: row.excerpt,
    }
  }

  /** An unmatched receipt put aside, with why from a fixed list: no payment is made. */
  async dismiss(
    tripId: string,
    id: string,
    reason: DismissReceiptReason,
    caller: Caller
  ): Promise<OrganizerTrip> {
    await this.trips.get(tripId, caller)
    if (!DISMISS_RECEIPT_REASONS.includes(reason))
      throw new BadRequestException('Say why it’s dismissed')
    const { count } = await this.prisma.forwardedReceipt.updateMany({
      where: { id, tripId, status: 'unmatched' },
      data: {
        status: 'dismissed',
        reason: DISMISS_RECEIPT_LABELS[reason],
        excerpt: '',
        decidedByUserId: caller.userId,
      },
    })
    if (!count) throw new ConflictException('Someone dealt with it a moment ago. Reload.')
    return this.trips.get(tripId, caller)
  }

  /**
   * The trip's receipts address: set, or changed (the old one stops working at once and is never chosen again until
   * an admin releases it), never cleared. Any of the trip's owners or organizers. One answer for an address in use and
   * one used before, so nobody learns which, or whose.
   */
  async setAddress(tripId: string, given: unknown, caller: Caller): Promise<TripReceipts> {
    const trip = await this.trips.get(tripId, caller)
    if (given !== null && typeof given !== 'string')
      throw new BadRequestException('The address must be text')
    const local = (given ?? '').trim().toLowerCase()
    if (!local) {
      if (trip.receipts.address)
        throw new BadRequestException('The address can be changed, not removed')
      throw new BadRequestException('Choose an address')
    }
    if (!RECEIPTS_ADDRESS_PATTERN.test(local))
      throw new BadRequestException(
        'Use 3 to 40 lowercase letters, numbers and hyphens, starting and ending with a letter or number'
      )
    if (local === trip.receipts.address) return trip.receipts
    // Mailbox names mail servers and certificate authorities write to: never a trip's (the database refuses them too).
    if (RESERVED.has(local)) throw new ConflictException(ADDRESS_TAKEN)
    const [taken] = await this.prisma.$queryRaw<{ taken: boolean }[]>(
      Prisma.sql`SELECT "receipts_address_taken"(${local}) AS taken`
    )
    if (taken?.taken) throw new ConflictException(ADDRESS_TAKEN)
    try {
      await this.prisma.trip.update({ where: { id: tripId }, data: { receiptsAddress: local } })
    } catch (e) {
      // Taken a moment ago, or held in the history since: the database's own check.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
        throw new ConflictException(ADDRESS_TAKEN)
      throw e
    }
    return (await this.trips.get(tripId, caller)).receipts
  }

  // ── The Admin toolbox ──────────────────────────────────────────────────────

  /**
   * The emails no trip has, or that went wrong, newest 200, as Audit Differently's "Not filed" (a recorded or matched
   * one is its trip's, never one refused at a retired address: those are counted on the address), and
   * every address a trip has used, with what still reached a retired one, so an admin can tell when it's safe to
   * release. Envelope only, never an email's text (an admin opens a payment's proof from the trip, read-only). Under
   * the admin's mark.
   */
  async adminList(): Promise<AdminForwardedReceipts> {
    const [rows, addresses, since] = await Promise.all([
      this.prisma.forwardedReceipt.findMany({
        where: {
          status: { in: ['received', 'processing', 'failed', 'rejected'] },
          OR: [{ tripId: { not: null } }, { reason: null }, { reason: { not: RETIRED } }],
        },
        orderBy: { receivedAt: 'desc' },
        take: 200,
      }),
      this.prisma.receiptsAddress.findMany({
        orderBy: [{ removedAt: { sort: 'desc', nulls: 'last' } }, { address: 'asc' }],
      }),
      this.prisma.$queryRaw<Since[]>(sinceRemovalSql(null)),
    ])
    const tripIds = [
      ...new Set([
        ...addresses.map((a) => a.tripId),
        ...rows.map((r) => r.tripId).filter((x): x is string => !!x),
      ]),
    ]
    const trips = new Map(
      (
        await this.prisma.trip.findMany({
          where: { id: { in: tripIds } },
          select: { id: true, name: true },
        })
      ).map((t) => [t.id, t.name])
    )
    const releasers = await this.clerk.names(
      addresses.map((a) => a.releasedByUserId).filter((x): x is string => !!x)
    )
    const byId = new Map(since.map((s) => [s.id, s]))
    const group = (a: AdminReceiptsAddress) => (a.releasedAt ? 2 : a.removedAt ? 0 : 1)
    return {
      on: !!receiptsConfig(),
      domain: receiptsDomain(),
      emails: rows.map((r) => adminEmail(r, trips)),
      addresses: addresses
        .map((a): AdminReceiptsAddress => {
          const s = byId.get(a.id)
          return {
            id: a.id,
            address: a.address,
            email: receiptsEmail(a.address),
            tripId: a.tripId,
            tripName: trips.get(a.tripId) ?? null,
            firstUsedAt: a.firstUsedAt.toISOString(),
            removedAt: a.removedAt?.toISOString() ?? null,
            receivedSinceRemoval: s?.received ?? 0,
            lastReceivedAt: s?.last ? new Date(s.last).toISOString() : null,
            releasedAt: a.releasedAt?.toISOString() ?? null,
            releasedBy: a.releasedByUserId
              ? (releasers.get(a.releasedByUserId) ?? a.releasedByUserId)
              : null,
            canRelease: !!a.removedAt && !a.releasedAt,
          }
        })
        .sort((a, b) => group(a) - group(b)),
    }
  }

  /** A failed email back in the queue, due now, its tries counted afresh. */
  async runAgain(id: string): Promise<AdminForwardedReceipts> {
    const { count } = await this.prisma.forwardedReceipt.updateMany({
      where: { id, status: 'failed' },
      data: {
        status: 'received',
        attempts: 0,
        nextAttemptAt: new Date(),
        error: null,
        reason: null,
      },
    })
    if (!count) throw new ConflictException('Only an email that failed runs again. Reload.')
    return this.adminList()
  }

  /**
   * Releases a retired address so any trip may choose it again; never a trip's current one. Only while no email has
   * arrived since the admin saw the count (`seen`), else 409 to look again. The database says who and when, and
   * removes the address's kept refused emails in the same statement.
   */
  async release(id: string, seen: unknown): Promise<AdminForwardedReceipts> {
    if (typeof seen !== 'number' || !Number.isInteger(seen) || seen < 0)
      throw new BadRequestException('Say how many emails you saw since it was retired')
    const row = await this.prisma.receiptsAddress.findFirst({ where: { id } })
    if (!row) throw new NotFoundException()
    if (!row.removedAt) throw new ConflictException('A trip’s current address is never released')
    if (row.releasedAt) throw new ConflictException('It was released already. Reload.')
    await this.prisma.$transaction(async (tx) => {
      const [now] = await tx.$queryRaw<Since[]>(sinceRemovalSql(id))
      if ((now?.received ?? 0) !== seen)
        throw new ConflictException('An email arrived since you opened this page. Reload.')
      const { count } = await tx.receiptsAddress.updateMany({
        where: { id, removedAt: { not: null }, releasedAt: null },
        // The database replaces the time with its own and names the admin (ReceiptsAddress_4_release).
        data: { releasedAt: new Date() },
      })
      if (!count) throw new ConflictException('It changed a moment ago. Reload.')
    })
    return this.adminList()
  }
}

/** How it was paid, in the trip's own words when it lists that kind ("Zelle · (555) 010-0199"). */
function methodFor(methods: PaymentMethod[], kind: PaymentMethodKind | null): string {
  const listed = kind ? methods.find((m) => m.kind === kind) : undefined
  return listed ? paymentMethodLabel(listed) : kind ? methodName(kind) : 'Forwarded receipt'
}

function adminEmail(r: ForwardedReceipt, trips: Map<string, string>): AdminForwardedReceipt {
  return {
    id: r.id,
    receivedAt: r.receivedAt.toISOString(),
    toAddress: r.toAddress,
    fromAddress: r.fromAddress,
    subject: r.subject,
    status: r.status as ForwardedReceiptStatus,
    tripId: r.tripId,
    tripName: r.tripId ? (trips.get(r.tripId) ?? null) : null,
    senderVerified: r.senderVerified,
    amountCents: r.amountCents,
    reason: r.reason,
    error: r.error,
    attempts: r.attempts,
    canRunAgain: r.status === 'failed',
  }
}

import { BadRequestException, Injectable } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import type { AcceptTermsInput, MyTerms, TermsKind, TermsStatus } from '../trips/trip-types'
import { TERMS } from './terms-text'

/** Where an acceptance came from, kept beside it as a signature keeps it. */
export interface From {
  ip: string
  userAgent: string
}

/**
 * Who has accepted CrewControl's current Terms (terms-text.ts). A TermsAcceptance row is one person accepting one
 * version of one document; rows are only ever added (migration 20261026040000_terms_acceptance). A yes is remembered in
 * memory, since an acceptance cannot be taken back; a no never is, so the next request asks the database again and
 * sees an acceptance made a moment ago on another instance.
 */
@Injectable()
export class TermsService {
  private readonly accepted = new Set<string>()

  constructor(private readonly prisma: PrismaService) {}

  async hasAccepted(userId: string, kind: TermsKind): Promise<boolean> {
    const key = `${userId}\n${kind}\n${TERMS[kind].version}`
    if (this.accepted.has(key)) return true
    const row = await this.prisma.termsAcceptance.findFirst({
      where: { userId, kind, fingerprint: TERMS[kind].version },
      select: { id: true },
    })
    if (row) this.accepted.add(key)
    return !!row
  }

  async status(userId: string, kind: TermsKind): Promise<TermsStatus> {
    const version = TERMS[kind].version
    const accepted = await this.hasAccepted(userId, kind)
    const previouslyAccepted =
      !accepted &&
      (await this.prisma.termsAcceptance.count({
        where: { userId, kind, fingerprint: { not: version } },
      })) > 0
    return { version, accepted, previouslyAccepted }
  }

  async mine(userId: string): Promise<MyTerms> {
    return {
      use: await this.status(userId, 'use'),
      organizer: await this.status(userId, 'organizer'),
    }
  }

  /** Records the versions accepted. Only the current versions are taken; accepting again changes nothing. */
  async accept(userId: string, input: AcceptTermsInput, from: From): Promise<MyTerms> {
    const kinds = acceptedKinds(input)
    await this.prisma.$transaction((tx) => this.record(tx, userId, kinds, from))
    this.remember(userId, kinds)
    return this.mine(userId)
  }

  /**
   * Writes the acceptances in a transaction the caller opened (the join step writes the Terms of Use with the
   * signature). Remembers nothing: the caller calls `remember` once the transaction committed, so a join that rolled
   * back (an email already on the trip, a full room) never counts as accepted.
   */
  async record(
    tx: Prisma.TransactionClient,
    userId: string,
    kinds: TermsKind[],
    from: From
  ): Promise<void> {
    await tx.termsAcceptance.createMany({
      data: kinds.map((kind) => ({
        userId,
        kind,
        fingerprint: TERMS[kind].version,
        ipAddress: from.ip.slice(0, 64),
        userAgent: from.userAgent.slice(0, 500),
      })),
      skipDuplicates: true,
    })
  }

  /** After a committed `record`: the next check needs no database read. */
  remember(userId: string, kinds: TermsKind[]): void {
    for (const kind of kinds) this.accepted.add(`${userId}\n${kind}\n${TERMS[kind].version}`)
  }
}

/** The documents an accept request takes, refusing any version but the current one (a page left open too long). */
export function acceptedKinds(input: AcceptTermsInput): TermsKind[] {
  const stale = () =>
    new BadRequestException(
      'The Terms changed since you opened this page. Reload and read them again.'
    )
  if (input.use !== TERMS.use.version) throw stale()
  if (input.organizer === undefined) return ['use']
  if (input.organizer !== TERMS.organizer.version) throw stale()
  return ['use', 'organizer']
}

export function parseAcceptTerms(raw: unknown): AcceptTermsInput {
  const body = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  if (typeof body.use !== 'string')
    throw new BadRequestException('Send the Terms version you accept')
  if (body.organizer !== undefined && typeof body.organizer !== 'string')
    throw new BadRequestException('organizer must be a Terms version')
  return body.organizer === undefined
    ? { use: body.use }
    : { use: body.use, organizer: body.organizer as string }
}

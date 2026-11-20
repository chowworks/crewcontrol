import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import type { Membership as MembershipRow } from '@prisma/client'
import type { Caller } from '../auth/caller'
import { ClerkService } from '../auth/clerk.service'
import { runAsSystem } from '../core/tenant-context'
import { PrismaService } from '../prisma/prisma.service'
import {
  PAID_FEATURES,
  type Membership,
  type MembershipInput,
  type MyFeatures,
  type PaidFeature,
} from '../trips/trip-types'

/** Today in Eastern time (YYYY-MM-DD): a membership's features stay on through its last day there. */
export function today(now = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
}

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null)

/** Whether a membership's last day has passed. */
export const hasEnded = (endsOn: string | null, now = new Date()) =>
  endsOn !== null && endsOn < today(now)

/** The features a person's memberships give them today (one per verified email, usually one in all). */
export function activeFeatures(
  rows: Pick<MembershipRow, 'features' | 'endsOn'>[],
  now = new Date()
) {
  const on = new Set<PaidFeature>()
  for (const r of rows)
    if (!hasEnded(day(r.endsOn), now)) for (const f of r.features) on.add(f as PaidFeature)
  return on
}

/**
 * Paid features (issue #90). The admin gives a person features by email; nothing is paid through Travel HQ. A person
 * has a feature when a membership for one of their verified emails ticks it and its last day hasn't passed. When it
 * ends, the feature quietly switches off: whatever uses it falls back to the free way, never to a dead page.
 */
@Injectable()
export class MembershipsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clerk: ClerkService
  ) {}

  /** A person's memberships, by their verified emails. Trusted work: only the admin reads the table. */
  private async mine(userId: string): Promise<MembershipRow[]> {
    const emails = await this.clerk.verifiedEmails(userId)
    if (!emails.length) return []
    return runAsSystem(() => this.prisma.membership.findMany({ where: { email: { in: emails } } }))
  }

  /** The one check: does this person have this paid feature today? Every paid feature asks it, on the API. */
  async has(userId: string, feature: PaidFeature): Promise<boolean> {
    return activeFeatures(await this.mine(userId)).has(feature)
  }

  /** Every paid feature this person has today. */
  async featuresOf(userId: string): Promise<Set<PaidFeature>> {
    return activeFeatures(await this.mine(userId))
  }

  /** What the signed-in person has, and the features to introduce in a popup (each once). */
  async myFeatures(caller: Caller): Promise<MyFeatures> {
    const rows = await this.mine(caller.userId)
    const on = activeFeatures(rows)
    const seen = new Set(rows.flatMap((r) => r.introsSeen))
    const endsOn = (f: PaidFeature) => {
      const ends = rows
        .filter((r) => r.features.includes(f) && !hasEnded(day(r.endsOn)))
        .map((r) => day(r.endsOn))
      // No end on any of them wins; otherwise the latest last day.
      return ends.includes(null) ? null : (ends.sort().at(-1) ?? null)
    }
    return {
      features: PAID_FEATURES.map((f) => ({
        key: f.key,
        has: on.has(f.key),
        endsOn: on.has(f.key) ? endsOn(f.key) : null,
      })),
      intros: PAID_FEATURES.filter((f) => on.has(f.key) && !seen.has(f.key)).map((f) => f.key),
    }
  }

  /** The person closed the popup for these features: don't show them again. Only features they hold are kept. */
  async markSeen(caller: Caller, features: PaidFeature[]): Promise<void> {
    const rows = await this.mine(caller.userId)
    await runAsSystem(() =>
      Promise.all(
        rows.map((r) => {
          const held = features.filter((f) => r.features.includes(f) && !r.introsSeen.includes(f))
          // Appended in the database, so an admin's change in between isn't written over.
          return held.length
            ? this.prisma.membership.update({
                where: { id: r.id },
                data: { introsSeen: { push: held } },
              })
            : null
        })
      )
    )
  }

  /** Every membership with features, for the Admin toolbox, with who last changed each by name. */
  async list(): Promise<Membership[]> {
    const rows = await this.prisma.membership.findMany({
      where: { NOT: { features: { isEmpty: true } } },
      orderBy: { updatedAt: 'desc' },
    })
    const names = await this.clerk.names([
      ...new Set(rows.flatMap((r) => (r.updatedByUserId ? [r.updatedByUserId] : []))),
    ])
    return rows.map((r) => ({
      email: r.email,
      features: PAID_FEATURES.map((f) => f.key).filter((k) => r.features.includes(k)),
      endsOn: day(r.endsOn),
      note: r.note,
      ended: hasEnded(day(r.endsOn)),
      updatedAt: r.updatedAt.toISOString(),
      updatedBy: r.updatedByUserId ? (names.get(r.updatedByUserId) ?? 'Unknown') : '',
    }))
  }

  /**
   * The admin adds a person (`isNew`: refused if they already have features) or changes their features. Which popups
   * they've seen is kept, so a feature they were shown isn't shown again; renewing a membership that had ended shows
   * them again, as a welcome back.
   */
  async set(
    email: string,
    input: MembershipInput,
    caller: Caller,
    isNew: boolean
  ): Promise<Membership[]> {
    const data = {
      features: input.features,
      endsOn: input.endsOn ? new Date(`${input.endsOn}T00:00:00Z`) : null,
      note: input.note,
      updatedAt: new Date(),
      updatedByUserId: caller.userId,
    }
    const existing = await this.prisma.membership.findUnique({ where: { email } })
    if (isNew && existing && existing.features.length)
      throw new ConflictException('This person is already a member. Change them in the list.')
    const renewed =
      existing !== null &&
      existing.features.length > 0 &&
      hasEnded(day(existing.endsOn)) &&
      !hasEnded(input.endsOn)
    try {
      await this.prisma.membership.upsert({
        where: { email },
        create: { email, ...data },
        update: { ...data, ...(renewed && { introsSeen: [] }) },
      })
    } catch (err) {
      // Two saves of a new person at once: the second becomes a change.
      if ((err as { code?: string }).code !== 'P2002') throw err
      await this.prisma.membership.update({ where: { email }, data })
    }
    return this.list()
  }

  /**
   * The admin takes a person's paid features away. The row stays, emptied, so Undo (or adding them again) remembers
   * which popups they've seen.
   */
  async remove(email: string): Promise<Membership[]> {
    const { count } = await this.prisma.membership.updateMany({
      where: { email, NOT: { features: { isEmpty: true } } },
      data: { features: [], endsOn: null, note: '', updatedAt: new Date() },
    })
    if (!count) throw new NotFoundException('Membership not found')
    return this.list()
  }
}

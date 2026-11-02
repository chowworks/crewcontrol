import { Logger } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import type { Caller } from '../auth/caller'
import { money } from '../join/agreement'
import { dateRange, day } from '../messaging/email-context'
import { tenantContext } from '../core/tenant-context'
import { PrismaService, rlsActive } from '../prisma/prisma.service'
import {
  paymentPlan,
  type JoinMode,
  type CostSplit,
  type RefundPolicy,
  type TripChange,
  type TripFieldChange,
  type TripOptions,
} from './trip-types'

const logger = new Logger('TripChanges')

/**
 * A line in the trip log for something the caller changed (owner's decision, 2026-11-01). `change` may be worked out
 * here (null: nothing to log), so that a comparison that throws can't fail the change either: a line that can't be
 * worked out or written goes to the API's log instead.
 */
export async function recordChange(
  prisma: PrismaService,
  tripId: string,
  caller: Caller,
  build: TripChange | (() => TripChange | null)
): Promise<void> {
  try {
    const change = typeof build === 'function' ? build() : build
    if (!change) return
    const details = change as unknown as Prisma.InputJsonValue
    // Connected as the owner (row-level security off) the caller isn't set in the database, so the line is written
    // directly, as admin_log_open's is.
    if (rlsActive())
      await prisma.$executeRaw(
        Prisma.sql`SELECT "log_trip_change"(${tripId}, ${JSON.stringify(change)}::jsonb)`
      )
    else
      await prisma.tripLog.create({
        data: {
          tripId,
          kind: 'change',
          actorUserId: caller.userId,
          details,
          // On the admin's own routes, as the database marks it.
          byAdmin: Boolean(tenantContext()?.admin),
        },
      })
  } catch (err) {
    logger.warn(`Trip log line not written for ${tripId}: ${(err as Error).message}`)
  }
}

/** What the trip editor saves, as the database row has it (photos as stored references, never signed links). */
export interface TripState {
  slug: string
  name: string
  destination: string
  startDate: string
  endDate: string
  organizerName: string
  description: string
  costPerPersonCents: number
  installmentCount: number
  paymentDueDates: unknown
  paymentReminderDays: number | null
  firstPaymentCents: number | null
  paymentShares?: unknown
  galleryTitle: string
  showGuestNames: boolean
  paymentMethods: unknown
  paymentInstructions: string
  published: boolean
  photos: unknown
  highlights: unknown
  keyDates: unknown
  maxGuests: number | null
  joinMode: string
  refundPolicy: string
  options: unknown
  saveTheDate: boolean
}

const JOIN_MODES: Record<JoinMode, string> = {
  accept_first: 'Accept first',
  pay_first: 'Pay first',
  first_come: 'First come, first served',
}
const REFUND_POLICIES: Record<RefundPolicy, string> = {
  spot_filled: 'Refund only if the spot is filled',
  first_payment_kept: 'First payment kept',
}
const COST_SPLITS: Record<CostSplit, string> = {
  even: 'Split the total evenly',
  room: 'Price by room',
  set: 'I know the price',
}
/** How a trip split its cost: saved before issue #65, how its rooms were priced said it. */
const splitOf = (o: Partial<TripOptions> & { roomPricing?: string }): CostSplit =>
  o.costSplit ?? (o.roomPricing ? (o.roomPricing === 'same' ? 'set' : 'room') : 'even')

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
const onOff = (v: unknown) => (v ? 'on' : 'off')

function planText(t: TripState): string {
  const dates = Array.isArray(t.paymentDueDates) ? (t.paymentDueDates as string[]) : []
  const shares = Array.isArray(t.paymentShares) ? (t.paymentShares as number[]) : null
  return paymentPlan(t.costPerPersonCents, t.installmentCount, t.firstPaymentCents, dates, shares)
    .map((p) => (p.dueOn ? `${money(p.amountCents)} by ${day(p.dueOn)}` : money(p.amountCents)))
    .join(', ')
}

/**
 * What a save of the trip editor changed, in the order the editor shows it. Short facts that matter to guests or money
 * (name, dates, price, spots, join mode, refund terms, payment plan, published) and switches say what they were and
 * became; long text and lists only that they changed. Empty when nothing did (moving between the editor's steps).
 */
export function tripChanges(before: TripState, after: TripState): TripFieldChange[] {
  const out: TripFieldChange[] = []
  const add = (changed: boolean, field: TripFieldChange['field'], from?: string, to?: string) => {
    if (changed) out.push(from === undefined ? { field } : { field, from, to })
  }
  const opts = (t: TripState) => (t.options ?? {}) as Partial<TripOptions>
  const [a, b] = [opts(before), opts(after)]
  add(before.name !== after.name, 'name', before.name, after.name)
  add(before.destination !== after.destination, 'destination')
  add(
    before.startDate !== after.startDate || before.endDate !== after.endDate,
    'dates',
    dateRange(before.startDate, before.endDate),
    dateRange(after.startDate, after.endDate)
  )
  add(before.organizerName !== after.organizerName, 'host')
  add(before.description !== after.description, 'description')
  add(before.slug !== after.slug, 'link', before.slug, after.slug)
  add(
    before.published !== after.published,
    'published',
    onOff(before.published),
    onOff(after.published)
  )
  add(
    before.saveTheDate !== after.saveTheDate,
    'saveTheDate',
    onOff(before.saveTheDate),
    onOff(after.saveTheDate)
  )
  const spots = (n: number | null) => (n === null ? 'no limit' : String(n))
  add(
    before.maxGuests !== after.maxGuests,
    'spots',
    spots(before.maxGuests),
    spots(after.maxGuests)
  )
  add(
    before.joinMode !== after.joinMode,
    'joinMode',
    JOIN_MODES[before.joinMode as JoinMode] ?? before.joinMode,
    JOIN_MODES[after.joinMode as JoinMode] ?? after.joinMode
  )
  add(
    before.refundPolicy !== after.refundPolicy,
    'refundPolicy',
    REFUND_POLICIES[before.refundPolicy as RefundPolicy] ?? before.refundPolicy,
    REFUND_POLICIES[after.refundPolicy as RefundPolicy] ?? after.refundPolicy
  )
  add(
    !same(before.showGuestNames, after.showGuestNames),
    'guestNames',
    onOff(before.showGuestNames),
    onOff(after.showGuestNames)
  )
  add(
    !!a.roomChoice !== !!b.roomChoice || !!a.roomRequired !== !!b.roomRequired,
    'roomChoice',
    a.roomChoice ? (a.roomRequired ? 'required' : 'on') : 'off',
    b.roomChoice ? (b.roomRequired ? 'required' : 'on') : 'off'
  )
  add((a.signupNote ?? '') !== (b.signupNote ?? ''), 'signupNote')
  add(
    before.costPerPersonCents !== after.costPerPersonCents,
    'price',
    money(before.costPerPersonCents),
    money(after.costPerPersonCents)
  )
  add(splitOf(a) !== splitOf(b), 'costSplit', COST_SPLITS[splitOf(a)], COST_SPLITS[splitOf(b)])
  add(
    (a.ownPartCents ?? 0) !== (b.ownPartCents ?? 0),
    'ownPart',
    money(a.ownPartCents ?? 0),
    money(b.ownPartCents ?? 0)
  )
  // The plan's own settings: a new price alone already says so above.
  add(
    before.installmentCount !== after.installmentCount ||
      before.firstPaymentCents !== after.firstPaymentCents ||
      !same(before.paymentShares, after.paymentShares) ||
      !same(before.paymentDueDates, after.paymentDueDates),
    'paymentPlan',
    planText(before),
    planText(after)
  )
  add(before.paymentReminderDays !== after.paymentReminderDays, 'reminders')
  add(!same(before.paymentMethods, after.paymentMethods), 'paymentMethods')
  add(before.paymentInstructions !== after.paymentInstructions, 'paymentInstructions')
  add(
    !!a.vendorCosts !== !!b.vendorCosts,
    'vendorCosts',
    onOff(a.vendorCosts),
    onOff(b.vendorCosts)
  )
  add(
    !!a.confirmReceipts !== !!b.confirmReceipts,
    'confirmReceipts',
    onOff(a.confirmReceipts),
    onOff(b.confirmReceipts)
  )
  add(before.galleryTitle !== after.galleryTitle, 'photoTitle')
  add(!same(before.photos, after.photos), 'photos')
  add(!same(before.highlights, after.highlights), 'highlights')
  add(!same(before.keyDates, after.keyDates), 'keyDates')
  return out
}

/** A room as the editor saves it. */
export interface RoomState {
  id: string
  name: string
  beds: unknown
  capacity: number
  bedTypes: unknown
  minPeople: number
  priceCents: number | null
}

/**
 * What a save of the rooms changed: rooms added, removed and renamed by name, each new price, and whether anything else
 * (beds, sizes, the order) did. Null when nothing changed.
 */
export function roomChanges(
  before: RoomState[],
  after: RoomState[],
  tripPriceCents: number
): Extract<TripChange, { what: 'rooms' }> | null {
  const price = (c: number | null) => money(c ?? tripPriceCents)
  const old = new Map(before.map((r) => [r.id, r]))
  const kept = new Set(after.map((r) => r.id))
  const change: Extract<TripChange, { what: 'rooms' }> = {
    what: 'rooms',
    added: after.filter((r) => !old.has(r.id)).map((r) => r.name),
    removed: before.filter((r) => !kept.has(r.id)).map((r) => r.name),
    renamed: [],
    prices: [],
    other: false,
  }
  const order = (rooms: RoomState[]) =>
    rooms.filter((r) => old.has(r.id) && kept.has(r.id)).map((r) => r.id)
  change.other = !same(order(before), order(after))
  for (const r of after) {
    const was = old.get(r.id)
    if (!was) continue
    if (was.name !== r.name) change.renamed.push({ from: was.name, to: r.name })
    if (price(was.priceCents) !== price(r.priceCents))
      change.prices.push({ room: r.name, from: price(was.priceCents), to: price(r.priceCents) })
    const rest = ({ beds, capacity, bedTypes, minPeople }: RoomState) => ({
      beds,
      capacity,
      bedTypes,
      minPeople,
    })
    if (!same(rest(was), rest(r))) change.other = true
  }
  const any =
    change.added.length ||
    change.removed.length ||
    change.renamed.length ||
    change.prices.length ||
    change.other
  return any ? change : null
}

/** The start of a long text, for a log line. */
export function snippet(text: string, max = 60): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat
}

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import type { Caller } from '../auth/caller'
import { MembershipsService } from '../memberships/memberships.service'
import { PrismaService } from '../prisma/prisma.service'
import { recordChange } from './trip-changes'
import { shortName } from './trip-mapper'
import {
  PAID_FEATURES,
  roomPrice,
  roomSpots,
  type BedType,
  type PaidFeature,
  type PlanSpot,
  type PlanTile,
  type RoomPlan,
  type RoomPlanApplyResult,
  type RoomPlanLayout,
  type RoomPlanMove,
} from './trip-types'
import { TripsService } from './trips.service'

type RoomRow = { id: string; name: string; capacity: number; bedTypes: string[] }

/** The width of a new part of the house, in dots: what fits beside the side panel on a laptop. */
const START_COLS = 43

/** A room's tile on a fresh plan: wide enough for its beds' pictures, tall enough for a name under each. */
const startSize = (room: RoomRow) => ({
  // A bunk's places sit beside it, so it takes more width than a bed with its names under it.
  w: Math.min(
    START_COLS,
    Math.max(
      10,
      room.bedTypes.reduce((n, b) => n + (b === 'bunk' ? 8 : 5), 2)
    )
  ),
  h: 12,
})

/**
 * The room planner (issue #93, a paid feature). One draft per trip, for its organizers only: they lay out the house,
 * put people on beds, save as often as they like and apply when they've decided. Applying moves the guests who are on
 * the trip into the rooms they're on; names typed in or taken from the Interested list stay in the planner.
 */
@Injectable()
export class RoomPlanService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly trips: TripsService,
    private readonly memberships: MembershipsService
  ) {}

  /** The paid features the trip has: a trip gets a feature when one of its owners has it. */
  async features(tripId: string, caller: Caller, admin = false): Promise<PaidFeature[]> {
    await this.trip(tripId, caller, admin)
    // The caller is on the trip (or the admin, which reads every trip's people), so its owners are theirs to read.
    const owners = await this.prisma.tripMember.findMany({
      where: { tripId, role: 'owner' },
      select: { userId: true },
    })
    const on = new Set<PaidFeature>()
    for (const o of owners) for (const f of await this.memberships.featuresOf(o.userId)) on.add(f)
    return PAID_FEATURES.filter((f) => on.has(f.key)).map((f) => f.key)
  }

  /** The draft, cleaned of rooms, guests and interested people that have gone since it was saved. */
  async get(tripId: string, caller: Caller, admin = false): Promise<RoomPlan> {
    await this.requireFeature(tripId, caller, admin)
    const [row, facts] = await Promise.all([
      this.prisma.roomPlan.findUnique({ where: { tripId } }),
      this.facts(tripId),
    ])
    const layout = row ? clean(row.layout as unknown as RoomPlanLayout, facts) : starter(facts)
    return { layout, updatedAt: row?.updatedAt.toISOString() ?? null }
  }

  async save(tripId: string, layout: RoomPlanLayout, caller: Caller): Promise<RoomPlan> {
    await this.requireFeature(tripId, caller)
    const facts = await this.facts(tripId)
    const rooms = new Map(facts.rooms.map((r) => [r.id, r]))
    for (const t of layout.tiles)
      if (t.roomId && !rooms.has(t.roomId))
        throw new BadRequestException('That room is not on this trip')
    for (const s of layout.spots) {
      const room = rooms.get(s.roomId)
      if (!room) throw new BadRequestException('That room is not on this trip')
      if (s.index >= spotsOf(room).length)
        throw new BadRequestException(`${room.name} doesn’t have that many places`)
      if (s.guestId && !facts.guests.has(s.guestId))
        throw new BadRequestException('Someone on the plan isn’t a guest on this trip')
      if (s.interestId && !facts.interest.has(s.interestId))
        throw new BadRequestException('Someone on the plan isn’t on the Interested list')
    }
    const data = {
      layout: layout as unknown as Prisma.InputJsonValue,
      updatedAt: new Date(),
      updatedByUserId: caller.userId,
    }
    await this.prisma.roomPlan.upsert({
      where: { tripId },
      create: { tripId, ...data },
      update: data,
    })
    return this.get(tripId, caller)
  }

  /** What applying the saved draft would do: each guest who changes room, and what it does to their balance. */
  async preview(tripId: string, caller: Caller): Promise<RoomPlanMove[]> {
    const { layout } = await this.get(tripId, caller)
    const trip = await this.trips.get(tripId, caller)
    const rooms = await this.prisma.room.findMany({ where: { tripId } })
    const settled = new Map(
      (
        await this.prisma.guest.findMany({
          where: { tripId },
          select: {
            id: true,
            roomPriceSettledCents: true,
            agreement: { select: { priceCents: true } },
          },
        })
      ).map((g) => [g.id, g.agreement ? (g.roomPriceSettledCents ?? g.agreement.priceCents) : null])
    )
    const roomName = (id: string | null) => rooms.find((r) => r.id === id)?.name ?? null
    const moves: RoomPlanMove[] = []
    for (const s of layout.spots) {
      const guest = s.guestId ? trip.guests.find((g) => g.id === s.guestId) : undefined
      if (!guest || guest.status === 'declined' || guest.roomId === s.roomId) continue
      const room = rooms.find((r) => r.id === s.roomId)!
      const before = settled.get(guest.id)
      moves.push({
        guestId: guest.id,
        name: shortName(guest.firstName, guest.lastName),
        fromRoom: roomName(guest.roomId),
        toRoom: room.name,
        priceDiffCents:
          before === null || before === undefined
            ? 0
            : roomPrice(room, trip.costPerPersonCents) - before,
        replacesOwnPick: trip.options.roomChoice && guest.roomId !== null,
      })
    }
    return moves
  }

  /** Applies the saved draft: the moves `preview` lists, the price changes with them, and the emails if asked. */
  async apply(tripId: string, email: boolean, caller: Caller): Promise<RoomPlanApplyResult> {
    const moves = await this.preview(tripId, caller)
    if (!moves.length) return { moved: 0, emailed: 0 }
    const { layout } = await this.get(tripId, caller)
    const target = new Map(layout.spots.flatMap((s) => (s.guestId ? [[s.guestId, s.roomId]] : [])))
    const emailed = await this.trips.moveGuests(
      tripId,
      moves.map((m) => ({ guestId: m.guestId, roomId: target.get(m.guestId)! })),
      email,
      caller
    )
    await recordChange(this.prisma, tripId, caller, {
      what: 'rooms_applied',
      moved: moves.map((m) => m.name),
    })
    return { moved: moves.length, emailed }
  }

  private async requireFeature(tripId: string, caller: Caller, admin = false): Promise<void> {
    // The admin looks at any trip read-only, as it does Trip Control.
    if (admin) return this.trip(tripId, caller, true)
    if (!(await this.features(tripId, caller)).includes('room_planner'))
      throw new ForbiddenException('The room planner is a paid feature')
  }

  /** A trip the caller works on (the admin: any trip); anyone else's reads as not found. */
  private async trip(id: string, caller: Caller, admin = false): Promise<void> {
    const found = await this.prisma.trip.findFirst({
      where: admin ? { id } : { id, deletedAt: null, members: { some: { userId: caller.userId } } },
      select: { id: true },
    })
    if (!found) throw new NotFoundException('Trip not found')
  }

  /** The trip's rooms, its guests still on it (and their rooms), and its Interested list. */
  private async facts(tripId: string): Promise<Facts> {
    const [rooms, guests, interest] = await Promise.all([
      this.prisma.room.findMany({
        where: { tripId },
        orderBy: { position: 'asc' },
        select: { id: true, name: true, capacity: true, bedTypes: true },
      }),
      this.prisma.guest.findMany({
        where: { tripId, status: { not: 'declined' } },
        orderBy: { createdAt: 'asc' },
        select: { id: true, firstName: true, lastName: true, roomId: true },
      }),
      this.prisma.tripInterest.findMany({ where: { tripId }, select: { id: true } }),
    ])
    return {
      rooms,
      guests: new Map(guests.map((g) => [g.id, g])),
      interest: new Set(interest.map((i) => i.id)),
    }
  }
}

interface Facts {
  rooms: RoomRow[]
  guests: Map<string, { id: string; firstName: string; lastName: string; roomId: string | null }>
  interest: Set<string>
}

const spotsOf = (room: RoomRow) =>
  roomSpots({ bedTypes: room.bedTypes as BedType[], capacity: room.capacity })

/**
 * A first draft: one part of the house with every room on it in rows, and each guest who already has a room on a place
 * in it, so the planner starts from how the trip stands.
 */
export function starter(facts: Facts): RoomPlanLayout {
  const tiles: PlanTile[] = []
  let x = 0
  let y = 0
  for (const room of facts.rooms) {
    const { w, h } = startSize(room)
    if (x + w > START_COLS) {
      x = 0
      y += h + 1
    }
    tiles.push({
      id: `t-${room.id}`.slice(0, 40),
      sectionId: 'main',
      roomId: room.id,
      landmark: null,
      x,
      y,
      w,
      h,
    })
    x += w + 1
  }
  const rows = Math.max(20, ...tiles.map((t) => t.y + t.h + 1))
  const spots: PlanSpot[] = []
  for (const g of facts.guests.values()) {
    const room = facts.rooms.find((r) => r.id === g.roomId)
    if (!room) continue
    const taken = spots.filter((s) => s.roomId === room.id).length
    if (taken >= spotsOf(room).length) continue
    spots.push({
      roomId: room.id,
      index: taken,
      name: shortName(g.firstName, g.lastName),
      guestId: g.id,
      interestId: null,
    })
  }
  return {
    sections: [
      { id: 'main', name: 'Main floor', beside: false, cols: START_COLS, rows: Math.min(rows, 80) },
    ],
    tiles,
    spots,
    waiting: [],
  }
}

/**
 * The saved draft as it stands today: tiles of rooms that were removed go; a place a room no longer has, or on a room
 * that's gone, gives its person back to the waiting names; someone who left the trip or the Interested list stays as
 * the name the organizer saw (owner's open question in #93: keep the name, drop the link).
 */
export function clean(layout: RoomPlanLayout, facts: Facts): RoomPlanLayout {
  const rooms = new Map(facts.rooms.map((r) => [r.id, r]))
  const waiting = [...(layout.waiting ?? [])]
  const spots: PlanSpot[] = []
  for (const s of layout.spots ?? []) {
    const room = rooms.get(s.roomId)
    const linked = {
      ...s,
      guestId: s.guestId && facts.guests.has(s.guestId) ? s.guestId : null,
      interestId: s.interestId && facts.interest.has(s.interestId) ? s.interestId : null,
    }
    if (room && s.index < spotsOf(room).length) spots.push(linked)
    else if (!linked.guestId && !linked.interestId) waiting.push(s.name)
  }
  return {
    sections: layout.sections,
    tiles: (layout.tiles ?? []).filter((t) => !t.roomId || rooms.has(t.roomId)),
    spots,
    waiting,
  }
}

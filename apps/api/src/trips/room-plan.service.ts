import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import type { Caller } from '../auth/caller'
import { MembershipsService } from '../memberships/memberships.service'
import { PrismaService } from '../prisma/prisma.service'
import { sharedCopy } from './shared-plan'
import { recordChange } from './trip-changes'
import { shortName } from './trip-mapper'
import {
  PAID_FEATURES,
  PLAN_MAX_ROWS,
  roomPrice,
  planPlaces,
  roomSpots,
  type BedType,
  type ApplyRoomPlanInput,
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
    return this.draft(tripId)
  }

  private async draft(tripId: string): Promise<RoomPlan> {
    const [row, facts] = await Promise.all([
      this.prisma.roomPlan.findUnique({ where: { tripId } }),
      this.facts(tripId),
    ])
    const layout = row ? clean(row.layout as unknown as RoomPlanLayout, facts) : starter(facts)
    return {
      layout,
      updatedAt: row?.updatedAt.toISOString() ?? null,
      sharedAt: row?.sharedAt?.toISOString() ?? null,
      sharedNames: (row?.shared as { names?: false } | null)?.names !== false,
    }
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
      if (
        s.index >=
        spotsOf(
          room,
          layout.tiles.find((t) => t.roomId === room.id)
        ).length
      )
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
    return this.draft(tripId)
  }

  /** What applying the saved draft would do: each guest who changes room, and what it does to their balance. */
  async preview(tripId: string, caller: Caller): Promise<RoomPlanMove[]> {
    await this.requireFeature(tripId, caller)
    return this.movesOf(tripId, (await this.draft(tripId)).layout, caller)
  }

  /**
   * Applies the saved draft: the moves `preview` lists, the price changes with them, and the emails if asked. It
   * refuses when the draft changed since the organizer looked at the moves (another organizer saved one), so what moves
   * is what they confirmed.
   */
  async apply(
    tripId: string,
    { email, draftAt, share }: ApplyRoomPlanInput,
    caller: Caller
  ): Promise<RoomPlanApplyResult> {
    await this.requireFeature(tripId, caller)
    const draft = await this.draft(tripId)
    if (!draft.updatedAt) throw new BadRequestException('Save the draft before applying it')
    if (draft.updatedAt !== draftAt)
      throw new ConflictException(
        'The draft changed since you opened Apply rooms. Open it again to see the moves.'
      )
    const moves = await this.movesOf(tripId, draft.layout, caller)
    // A room the organizer gave more places, or put more people in, sleeps that many from now on. It grows before the
    // moves, so the guests moving into it fit.
    const rooms = await this.prisma.room.findMany({
      where: { tripId },
      select: { id: true, name: true, capacity: true },
    })
    const grown = rooms.flatMap((r) => {
      const places = Math.max(
        planPlaces(
          r,
          draft.layout.tiles.find((t) => t.roomId === r.id)
        ),
        draft.layout.spots.filter((s) => s.roomId === r.id).length
      )
      return places > r.capacity ? [{ id: r.id, room: r.name, from: r.capacity, to: places }] : []
    })
    for (const g of grown)
      await this.prisma.room.update({ where: { id: g.id }, data: { capacity: g.to } })
    // The places are the room's own now: dropping them from the draft keeps a later change in the editor from being
    // undone by the next Apply.
    if (draft.layout.tiles.some((t) => t.places !== undefined))
      await this.prisma.roomPlan.update({
        where: { tripId },
        data: {
          layout: {
            ...draft.layout,
            tiles: draft.layout.tiles.map((t) => {
              const tile = { ...t }
              delete tile.places
              return tile
            }),
          } as unknown as Prisma.InputJsonValue,
        },
      })
    const result = { moved: 0, emailed: 0, unsettled: [] as string[] }
    if (moves.length)
      Object.assign(
        result,
        await this.trips.moveGuests(
          tripId,
          moves.map((m) => ({ guestId: m.guestId, roomId: m.toRoomId })),
          email,
          caller
        )
      )
    if (moves.length || grown.length)
      await recordChange(this.prisma, tripId, caller, {
        what: 'rooms_applied',
        moved: moves.map((m) => m.name),
        ...(grown.length ? { grown: grown.map(({ room, from, to }) => ({ room, from, to })) } : {}),
      })
    // Guests see the plan as applied now, or no plan when the organizer stopped sharing it.
    // Applying keeps the way it was shared: with no names stays with no names.
    if (share) await this.keepShared(tripId, draft.layout, !draft.sharedAt || draft.sharedNames)
    else if (draft.sharedAt) await this.unshare(tripId, caller)
    const { emailed, unsettled } = result
    return {
      moved: moves.length,
      emailed,
      needsLook: moves.filter((m) => unsettled.includes(m.guestId)).map((m) => m.name),
    }
  }

  /**
   * Shares the plan on the trip page. With names, only when applying has nothing to do: everyone on it is in their room
   * already, so the saved draft is the trip as it stands, and with moves waiting the organizer applies them to share
   * (never a draft). With no names (owner's decision, 2026-11-28), the rooms and beds go up as drawn, no Apply needed:
   * nobody's place is on it.
   */
  async share(
    tripId: string,
    { draftAt, names }: { draftAt: string; names: boolean },
    caller: Caller
  ): Promise<RoomPlan> {
    await this.requireFeature(tripId, caller)
    const draft = await this.draft(tripId)
    if (!draft.updatedAt) throw new BadRequestException('Save the draft before sharing it')
    if (draft.updatedAt !== draftAt)
      throw new ConflictException('The draft changed since you looked. Open it again.')
    if (names && (await this.movesOf(tripId, draft.layout, caller)).length)
      throw new BadRequestException(
        'To show names, apply rooms first: some guests are in other rooms on the plan.'
      )
    await this.keepShared(tripId, draft.layout, names)
    return this.draft(tripId)
  }

  /** Stops showing the plan to guests, at once. */
  async unshare(tripId: string, caller: Caller): Promise<RoomPlan> {
    await this.requireFeature(tripId, caller)
    await this.prisma.roomPlan.updateMany({
      where: { tripId },
      data: { shared: Prisma.DbNull, sharedAt: null },
    })
    return this.draft(tripId)
  }

  private async keepShared(tripId: string, layout: RoomPlanLayout, names: boolean): Promise<void> {
    const rooms = await this.prisma.room.findMany({
      where: { tripId },
      select: { id: true, name: true, capacity: true, bedTypes: true },
    })
    await this.prisma.roomPlan.update({
      where: { tripId },
      data: {
        shared: sharedCopy(layout, rooms, names) as unknown as Prisma.InputJsonValue,
        sharedAt: new Date(),
      },
    })
  }

  /**
   * The moves a layout makes: each guest on a bed in a room that isn't theirs, and each guest with a room who is on no
   * bed in the plan, who leaves their room (the plan is how the house will be).
   */
  private async movesOf(
    tripId: string,
    layout: RoomPlanLayout,
    caller: Caller
  ): Promise<RoomPlanMove[]> {
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
    const target = new Map(layout.spots.flatMap((s) => (s.guestId ? [[s.guestId, s.roomId]] : [])))
    const moves: RoomPlanMove[] = []
    for (const guest of trip.guests) {
      if (guest.status === 'declined') continue
      const to = target.get(guest.id) ?? null
      if (guest.roomId === to) continue
      const room = rooms.find((r) => r.id === to)
      const before = settled.get(guest.id)
      moves.push({
        guestId: guest.id,
        name: shortName(guest.firstName, guest.lastName),
        fromRoom: roomName(guest.roomId),
        toRoom: room?.name ?? null,
        toRoomId: room?.id ?? null,
        priceDiffCents:
          !room || before === null || before === undefined
            ? 0
            : roomPrice(room, trip.costPerPersonCents) - before,
        replacesOwnPick: trip.options.roomChoice && guest.roomId !== null,
      })
    }
    return moves
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
        select: { id: true, firstName: true, lastName: true, roomId: true, userId: true },
      }),
      this.prisma.tripInterest.findMany({ where: { tripId }, select: { id: true, userId: true } }),
    ])
    const guestOf = new Map(guests.flatMap((g) => (g.userId ? [[g.userId, g.id]] : [])))
    return {
      rooms,
      guests: new Map(guests.map((g) => [g.id, g])),
      // Someone on the Interested list who has since signed up is that guest now.
      interest: new Set(interest.filter((i) => !guestOf.has(i.userId)).map((i) => i.id)),
      signedUp: new Map(
        interest.flatMap((i) => (guestOf.has(i.userId) ? [[i.id, guestOf.get(i.userId)!]] : []))
      ),
    }
  }
}

interface Facts {
  rooms: RoomRow[]
  guests: Map<string, { id: string; firstName: string; lastName: string; roomId: string | null }>
  interest: Set<string>
  /** Interested people who signed up since: their interest id, and the guest they are now. */
  signedUp?: Map<string, string>
}

/** A room's places on the plan: what it sleeps, or more when the organizer added places on its tile. */
const spotsOf = (room: RoomRow, tile?: PlanTile) =>
  roomSpots({ bedTypes: room.bedTypes as BedType[], capacity: planPlaces(room, tile) })

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
    // A house too big for one part leaves its last rooms under Rooms to place.
    if (y + h + 1 > PLAN_MAX_ROWS) break
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
    if (!room || !tiles.some((t) => t.roomId === room.id)) continue
    // One guest on each bed before anyone shares, so two guests in a room with two queens get a queen each.
    const free = spotsOf(room)
      .filter((p) => !spots.some((s) => s.roomId === room.id && s.index === p.index))
      .sort((a, b) => a.slot - b.slot || a.index - b.index)[0]
    if (!free) continue
    spots.push({
      roomId: room.id,
      index: free.index,
      name: shortName(g.firstName, g.lastName),
      guestId: g.id,
      interestId: null,
    })
  }
  return {
    sections: [
      {
        id: 'main',
        name: 'Main floor',
        beside: false,
        cols: START_COLS,
        rows: Math.min(rows, PLAN_MAX_ROWS),
      },
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
  const onPlan = new Set((layout.spots ?? []).flatMap((s) => (s.guestId ? [s.guestId] : [])))
  for (const s of layout.spots ?? []) {
    const room = rooms.get(s.roomId)
    // An interested person who signed up since takes their bed as that guest, unless the guest has one already.
    const now = s.interestId ? facts.signedUp?.get(s.interestId) : undefined
    const became = now && !onPlan.has(now) && facts.guests.has(now) ? now : null
    if (became) onPlan.add(became)
    const guest = became ? facts.guests.get(became) : undefined
    const linked = {
      ...s,
      name: guest ? shortName(guest.firstName, guest.lastName) : s.name,
      guestId: became ?? (s.guestId && facts.guests.has(s.guestId) ? s.guestId : null),
      interestId: !became && s.interestId && facts.interest.has(s.interestId) ? s.interestId : null,
    }
    const tile = (layout.tiles ?? []).find((t) => t.roomId === s.roomId)
    if (room && s.index < spotsOf(room, tile).length) spots.push(linked)
    else if (!linked.guestId && !linked.interestId) waiting.push(s.name)
  }
  // A name typed on a bed before that person signed up becomes them once they have (owner's ask, 2026-11-28): the
  // typed name starts with their first name, and nobody else could be meant (one guest off the plan with that first
  // name, one typed name for it).
  const firstWord = (name: string) => name.trim().split(/[\s(]/)[0].toLowerCase()
  const offPlan = [...facts.guests.values()].filter((g) => !onPlan.has(g.id))
  const typed = spots.filter((s) => !s.guestId && !s.interestId)
  for (const s of typed) {
    const first = firstWord(s.name)
    if (!first || typed.filter((t) => firstWord(t.name) === first).length !== 1) continue
    const meant = offPlan.filter((g) => g.firstName.trim().toLowerCase() === first)
    if (meant.length !== 1 || onPlan.has(meant[0].id)) continue
    const g = meant[0]
    onPlan.add(g.id)
    spots[spots.indexOf(s)] = { ...s, name: shortName(g.firstName, g.lastName), guestId: g.id }
  }
  return {
    sections: layout.sections,
    tiles: (layout.tiles ?? []).filter((t) => !t.roomId || rooms.has(t.roomId)),
    spots,
    waiting,
  }
}

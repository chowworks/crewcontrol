import { shortName } from './trip-mapper'
import {
  planPlaces,
  roomSpots,
  type BedType,
  type PlanSection,
  type PlanTile,
  type RoomPlanLayout,
  type SharedPlanTile,
  type SharedRoomPlan,
} from './trip-types'

/**
 * The copy of the plan kept when an organizer shares it (RoomPlan.shared): the plan as applied, with each room's name
 * and beds, and only which guest is on each place. Typed names and the Interested list are left out here, so they can't
 * reach a guest later.
 */
export interface SharedPlanCopy {
  sections: PlanSection[]
  tiles: PlanTile[]
  rooms: { id: string; name: string; bedTypes: BedType[] }[]
  spots: { roomId: string; index: number; guestId: string | null }[]
  /** False when the organizer shared it with no names for anyone (owner's decision, 2026-11-28): no spots kept. */
  names?: false
}

export function sharedCopy(
  layout: RoomPlanLayout,
  rooms: { id: string; name: string; capacity: number; bedTypes: string[] }[],
  names = true
): SharedPlanCopy {
  const onPlan = rooms.filter((r) => layout.tiles.some((t) => t.roomId === r.id))
  return {
    sections: layout.sections,
    tiles: layout.tiles.map((t) => {
      const room = t.roomId ? rooms.find((r) => r.id === t.roomId) : undefined
      // A room's places as applied: what it sleeps now, or the people put in it.
      const places = room
        ? Math.max(planPlaces(room, t), layout.spots.filter((s) => s.roomId === room.id).length)
        : undefined
      const tile: PlanTile = { ...t }
      delete tile.places
      return places ? { ...tile, places } : tile
    }),
    rooms: onPlan.map((r) => ({ id: r.id, name: r.name, bedTypes: r.bedTypes as BedType[] })),
    spots: names
      ? layout.spots.map((s) => ({ roomId: s.roomId, index: s.index, guestId: s.guestId }))
      : [],
    ...(names ? {} : { names: false as const }),
  }
}

/**
 * The shared plan as a guest sees it: accepted guests by "First L.", everyone else on a bed only as taken, and the
 * places of the reader (or the travelers they look after) marked.
 */
export function guestPlan(
  copy: SharedPlanCopy,
  sharedAt: Date,
  accepted: { id: string; firstName: string; lastName: string }[],
  yours: string[]
): SharedRoomPlan {
  const names = new Map(accepted.map((g) => [g.id, shortName(g.firstName, g.lastName)]))
  return {
    sharedAt: sharedAt.toISOString(),
    sections: copy.sections,
    tiles: copy.tiles.flatMap((t): SharedPlanTile[] => {
      const base = { id: t.id, sectionId: t.sectionId, x: t.x, y: t.y, w: t.w, h: t.h }
      if (!t.roomId) return [{ ...base, landmark: t.landmark, room: null }]
      const room = copy.rooms.find((r) => r.id === t.roomId)
      if (!room) return []
      return [
        {
          ...base,
          landmark: null,
          room: {
            name: room.name,
            bedTypes: room.bedTypes,
            places: roomSpots({ bedTypes: room.bedTypes, capacity: t.places ?? 0 }).map((p) => {
              const spot = copy.spots.find((s) => s.roomId === room.id && s.index === p.index)
              const name = spot?.guestId ? (names.get(spot.guestId) ?? null) : null
              return {
                ...p,
                name,
                taken: !!spot,
                you: !!spot?.guestId && name !== null && yours.includes(spot.guestId),
              }
            }),
          },
        },
      ]
    }),
  }
}

/**
 * The shared plan for the public trip page (owner's decision, 2026-11-28): the copy without who is on each place, so
 * every place reads the same, with no names and nothing taken.
 */
export function publicPlan(copy: Omit<SharedPlanCopy, 'spots'>, sharedAt: Date): SharedRoomPlan {
  return guestPlan({ ...copy, spots: [] }, sharedAt, [], [])
}

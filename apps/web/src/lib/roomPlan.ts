import {
  PLAN_MAX_COLS,
  PLAN_MAX_ROWS,
  ROOM_MAX_PLACES,
  planPlaces,
  roomSpots,
  type BedType,
  type Guest,
  type InterestedPerson,
  type PlanSection,
  type PlanSpot,
  type PlanTile,
  type RoomPlanLayout,
} from '@cc/types'

/**
 * The room planner's rules on the browser side (issue #93): who can be placed, and what placing, moving and removing
 * do to the draft. Each returns a new layout; the page saves it when the organizer presses Save draft.
 */

/** Filled purple, outlined, dashed or grey on the plan (the legend's four). */
export type PersonKind = 'accepted' | 'pending' | 'interested' | 'typed'

export interface Person {
  /** g:<guest id>, i:<interest id>, or w:<place in the waiting names> for a typed name not placed yet. */
  key: string
  name: string
  kind: PersonKind
  guestId: string | null
  interestId: string | null
}

/** Where a person is being dragged from: a place on a bed, or the side panel. */
export type From = { roomId: string; index: number } | { waiting: number } | 'panel'

export const shortName = (first: string, last: string) => {
  const initial = last.trim().charAt(0).toUpperCase()
  return initial ? `${first.trim()} ${initial}.` : first.trim()
}

/** Everyone from the trip who can go on a bed: guests still on it, and the Interested list (those not signed up yet). */
export function tripPeople(guests: Guest[], interest: InterestedPerson[]): Person[] {
  return [
    ...guests
      .filter((g) => g.status !== 'declined')
      .map((g) => ({
        key: `g:${g.id}`,
        name: shortName(g.firstName, g.lastName),
        kind: (g.status === 'approved' ? 'accepted' : 'pending') as PersonKind,
        guestId: g.id,
        interestId: null,
      })),
    ...interest
      .filter((i) => !i.signed)
      .map((i) => ({
        key: `i:${i.id}`,
        name: shortName(i.firstName, i.lastName),
        kind: 'interested' as PersonKind,
        guestId: null,
        interestId: i.id,
      })),
  ]
}

const keyOf = (s: Pick<PlanSpot, 'guestId' | 'interestId'>) =>
  s.guestId ? `g:${s.guestId}` : s.interestId ? `i:${s.interestId}` : null

/** Who is on a place, with the look the trip says they have. */
export function spotPerson(spot: PlanSpot, people: Person[]): Person {
  const key = keyOf(spot)
  return (
    (key && people.find((p) => p.key === key)) || {
      key: `s:${spot.roomId}:${spot.index}`,
      name: spot.name,
      kind: 'typed',
      guestId: null,
      interestId: null,
    }
  )
}

/** The side panel's "Not placed yet": the trip's people not on a bed, then the typed names waiting. */
export function notPlaced(layout: RoomPlanLayout, people: Person[]): Person[] {
  const placed = new Set(layout.spots.map(keyOf).filter(Boolean))
  return [
    ...people.filter((p) => !placed.has(p.key)),
    ...layout.waiting.map((name, i) => ({
      key: `w:${i}`,
      name,
      kind: 'typed' as PersonKind,
      guestId: null,
      interestId: null,
    })),
  ]
}

const toSpot = (p: Person, roomId: string, index: number): PlanSpot => ({
  roomId,
  index,
  name: p.name,
  guestId: p.guestId,
  interestId: p.interestId,
})

const at = (s: PlanSpot, roomId: string, index: number) => s.roomId === roomId && s.index === index

/** A spot's person put back in the side panel: a typed name joins the waiting names, anyone else just shows there. */
function giveBack(layout: RoomPlanLayout, spot: PlanSpot): RoomPlanLayout {
  return keyOf(spot) ? layout : { ...layout, waiting: [...layout.waiting, spot.name] }
}

/**
 * Puts someone on a place. Whoever was there swaps to where they came from, or goes back to the side panel when they
 * came from there.
 */
export function place(
  layout: RoomPlanLayout,
  person: Person,
  from: From,
  to: { roomId: string; index: number }
): RoomPlanLayout {
  const fromSpot = typeof from === 'object' && 'roomId' in from ? from : null
  if (fromSpot && fromSpot.roomId === to.roomId && fromSpot.index === to.index) return layout
  const occupant = layout.spots.find((s) => at(s, to.roomId, to.index))
  let next: RoomPlanLayout = {
    ...layout,
    spots: layout.spots.filter(
      (s) =>
        !at(s, to.roomId, to.index) &&
        !(fromSpot && at(s, fromSpot.roomId, fromSpot.index)) &&
        // Someone from the trip is on one place at most.
        !(keyOf(s) !== null && keyOf(s) === keyOf(person))
    ),
    waiting:
      typeof from === 'object' && 'waiting' in from
        ? layout.waiting.filter((_, i) => i !== from.waiting)
        : layout.waiting,
  }
  if (occupant) {
    if (fromSpot)
      next = {
        ...next,
        spots: [...next.spots, { ...occupant, roomId: fromSpot.roomId, index: fromSpot.index }],
      }
    else next = giveBack(next, occupant)
  }
  return { ...next, spots: [...next.spots, toSpot(person, to.roomId, to.index)] }
}

/** Takes someone off their place, back to the side panel. */
export function unplace(layout: RoomPlanLayout, roomId: string, index: number): RoomPlanLayout {
  const spot = layout.spots.find((s) => at(s, roomId, index))
  if (!spot) return layout
  return giveBack({ ...layout, spots: layout.spots.filter((s) => s !== spot) }, spot)
}

export const addTyped = (layout: RoomPlanLayout, name: string): RoomPlanLayout => ({
  ...layout,
  waiting: [...layout.waiting, name.trim()],
})

export const removeTyped = (layout: RoomPlanLayout, i: number): RoomPlanLayout => ({
  ...layout,
  waiting: layout.waiting.filter((_, j) => j !== i),
})

export const uid = () => Math.random().toString(36).slice(2, 12)

/** A room's tile taken off the plan: it waits under Rooms to place, and the people on it go back to the side panel. */
export function removeTile(layout: RoomPlanLayout, tileId: string): RoomPlanLayout {
  const tile = layout.tiles.find((t) => t.id === tileId)
  if (!tile) return layout
  let next: RoomPlanLayout = { ...layout, tiles: layout.tiles.filter((t) => t.id !== tileId) }
  if (tile.roomId)
    for (const s of layout.spots.filter((s) => s.roomId === tile.roomId))
      next = unplace(next, s.roomId, s.index)
  return next
}

/**
 * Puts a tile where it was dropped or dragged, in dots, kept inside the part of the house to the left and top. Past the
 * right or bottom edge the part grows, up to its limit.
 */
export function setTile(layout: RoomPlanLayout, tile: PlanTile): RoomPlanLayout {
  const section = layout.sections.find((s) => s.id === tile.sectionId)
  if (!section) return layout
  const w = Math.max(2, Math.min(tile.w, PLAN_MAX_COLS))
  const h = Math.max(2, Math.min(tile.h, PLAN_MAX_ROWS))
  const x = Math.max(0, Math.min(tile.x, PLAN_MAX_COLS - w))
  const y = Math.max(0, Math.min(tile.y, PLAN_MAX_ROWS - h))
  const placed = { ...tile, x, y, w, h }
  return {
    ...layout,
    sections: layout.sections.map((s) =>
      s.id === section.id
        ? {
            ...s,
            cols: Math.max(s.cols, x + w),
            rows: Math.min(PLAN_MAX_ROWS, Math.max(s.rows, y + h + 1)),
          }
        : s
    ),
    tiles: layout.tiles.some((t) => t.id === tile.id)
      ? layout.tiles.map((t) => (t.id === tile.id ? placed : t))
      : [...layout.tiles, placed],
  }
}

/**
 * A room given more places on the plan than it sleeps, or one taken back (only an empty last place goes). Applying the
 * plan makes the room sleep that many.
 */
export function setPlaces(
  layout: RoomPlanLayout,
  room: { id?: string; capacity: number; bedTypes: BedType[] },
  places: number
): RoomPlanLayout {
  const tile = layout.tiles.find((t) => t.roomId === room.id)
  if (!tile) return layout
  const now = planPlaces(room, tile)
  const n = Math.max(room.capacity, Math.min(places, ROOM_MAX_PLACES))
  const inRoom = layout.spots.filter((s) => s.roomId === room.id)
  const last = roomSpots({ ...room, capacity: n }).length
  if (n < now && (inRoom.length > n || inRoom.some((s) => s.index >= last))) return layout
  return {
    ...layout,
    tiles: layout.tiles.map((t) => {
      if (t.id !== tile.id) return t
      const { places: _, ...rest } = t
      return n > room.capacity ? { ...rest, places: n } : rest
    }),
  }
}

/** After someone lands in a room: a room with more people than it sleeps gets the places they need. */
export function fitPlaces(
  layout: RoomPlanLayout,
  room: { id?: string; capacity: number; bedTypes: BedType[] }
): RoomPlanLayout {
  const tile = layout.tiles.find((t) => t.roomId === room.id)
  const count = layout.spots.filter((s) => s.roomId === room.id).length
  return count > planPlaces(room, tile) ? setPlaces(layout, room, count) : layout
}

/**
 * A part of the house made bigger or smaller by dragging its right or bottom edge, in dots. It never cuts into a room
 * or landmark on it, and stays within what the server takes.
 */
export function resizeSection(
  layout: RoomPlanLayout,
  id: string,
  cols: number,
  rows: number
): RoomPlanLayout {
  const on = layout.tiles.filter((t) => t.sectionId === id)
  const minCols = Math.max(4, ...on.map((t) => t.x + t.w))
  const minRows = Math.max(4, ...on.map((t) => t.y + t.h))
  return {
    ...layout,
    sections: layout.sections.map((s) =>
      s.id === id
        ? {
            ...s,
            cols: Math.max(minCols, Math.min(cols, PLAN_MAX_COLS)),
            rows: Math.max(minRows, Math.min(rows, PLAN_MAX_ROWS)),
          }
        : s
    ),
  }
}

/**
 * A part of the house moved below or beside another, by its handle. The parts sit in columns (see `sectionColumns`):
 * below puts it right under the target in the target's column; beside starts a new column just right of the
 * target's.
 */
export function moveSection(
  layout: RoomPlanLayout,
  id: string,
  targetId: string,
  where: 'below' | 'beside'
): RoomPlanLayout {
  if (id === targetId) return layout
  const moving = layout.sections.find((s) => s.id === id)
  if (!moving) return layout
  const rest = lift(layout.sections, id)
  let i = rest.findIndex((s) => s.id === targetId)
  if (i < 0) return layout
  // Beside goes after the target's whole column, so that column stays together.
  if (where === 'beside') while (rest[i + 1] && !rest[i + 1].beside) i++
  return {
    ...layout,
    sections: [
      ...rest.slice(0, i + 1),
      { ...moving, beside: where === 'beside' },
      ...rest.slice(i + 1),
    ].map((s, j) => (j === 0 ? { ...s, beside: false } : s)),
  }
}

/** The parts without one of them: when it led a column, the part under it leads that column now. */
function lift(sections: PlanSection[], id: string): PlanSection[] {
  const i = sections.findIndex((s) => s.id === id)
  if (i < 0) return sections
  const gone = sections[i]
  const under = sections[i + 1]
  const head = i === 0 || gone.beside
  return sections
    .filter((s) => s.id !== id)
    .map((s) =>
      head && under && s.id === under.id && !under.beside ? { ...s, beside: gone.beside } : s
    )
    .map((s, j) => (j === 0 ? { ...s, beside: false } : s))
}

/** A part of the house taken away: its rooms go back to Rooms to place and their people to the side panel. */
export function removeSection(layout: RoomPlanLayout, id: string): RoomPlanLayout {
  let next = layout
  for (const t of layout.tiles.filter((t) => t.sectionId === id)) next = removeTile(next, t.id)
  return { ...next, sections: lift(next.sections, id) }
}

/** The parts of the house in columns, left to right: a part marked beside starts a new column; the rest stack under. */
export function sectionColumns<T extends { beside: boolean }>(sections: T[]): T[][] {
  const columns: T[][] = []
  for (const s of sections) {
    if (!s.beside && columns.length) columns[columns.length - 1].push(s)
    else columns.push([s])
  }
  return columns
}

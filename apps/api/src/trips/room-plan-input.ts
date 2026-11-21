import {
  LANDMARK_KINDS,
  PLAN_MAX_COLS,
  PLAN_MAX_ROWS,
  PLAN_MAX_SECTIONS,
  PLAN_MAX_TILES,
  PLAN_NAME_MAX,
  ROOM_MAX_PLACES,
  type ApplyRoomPlanInput,
  type LandmarkKind,
  type PlanSection,
  type PlanSpot,
  type PlanTile,
  type RoomPlanLayout,
} from './trip-types'
import { bool, fail, int, list, text, type Body } from './trip-input'

const ID = /^[A-Za-z0-9_-]{1,40}$/
const id = (body: Body, key: string): string => {
  const value = body[key]
  if (typeof value !== 'string' || !ID.test(value)) fail(`${key} must be an id`)
  return value
}
const optionalId = (body: Body, key: string): string | null =>
  body[key] === null || body[key] === undefined ? null : id(body, key)

function section(item: Body): PlanSection {
  return {
    id: id(item, 'id'),
    name: text(item, 'name', PLAN_NAME_MAX),
    beside: bool(item, 'beside'),
    cols: int(item, 'cols', 4, PLAN_MAX_COLS),
    rows: int(item, 'rows', 4, PLAN_MAX_ROWS),
  }
}

function tile(item: Body, sections: PlanSection[]): PlanTile {
  const sectionId = id(item, 'sectionId')
  const where = sections.find((s) => s.id === sectionId)
  if (!where) fail('A tile is on a part of the house that isn’t there')
  const roomId = optionalId(item, 'roomId')
  const raw = item.landmark
  let landmark: PlanTile['landmark'] = null
  if (raw !== null && raw !== undefined) {
    if (typeof raw !== 'object') fail('landmark must be an object')
    const l = raw as Body
    if (!LANDMARK_KINDS.includes(l.kind as LandmarkKind))
      fail(`landmark kind must be one of ${LANDMARK_KINDS.join(', ')}`)
    landmark = { kind: l.kind as LandmarkKind, label: text(l, 'label', PLAN_NAME_MAX) }
    if (l.turn !== undefined && l.turn !== null && l.turn !== 0)
      landmark.turn = int(l, 'turn', 1, 3)
  }
  if (!roomId === !landmark) fail('A tile is either a room or a landmark')
  const w = int(item, 'w', 2, PLAN_MAX_COLS)
  const h = int(item, 'h', 2, PLAN_MAX_ROWS)
  // Kept inside its part of the house: the part grows when a tile is dragged past its edge.
  const x = int(item, 'x', 0, where.cols - w)
  const y = int(item, 'y', 0, where.rows - h)
  // A room's places, when the organizer added some on the plan.
  if (item.places !== undefined && item.places !== null) {
    if (!roomId) fail('Only a room has places')
    return {
      id: id(item, 'id'),
      sectionId,
      roomId,
      landmark,
      x,
      y,
      w,
      h,
      places: int(item, 'places', 1, ROOM_MAX_PLACES),
    }
  }
  return { id: id(item, 'id'), sectionId, roomId, landmark, x, y, w, h }
}

function spot(item: Body): PlanSpot {
  const guestId = optionalId(item, 'guestId')
  const interestId = optionalId(item, 'interestId')
  if (guestId && interestId) fail('A spot is picked from a guest or the Interested list, not both')
  return {
    roomId: id(item, 'roomId'),
    index: int(item, 'index', 0, 19),
    name: text(item, 'name', PLAN_NAME_MAX),
    guestId,
    interestId,
  }
}

/**
 * The planner's draft as the browser sends it. Checks its shape and limits only; which rooms, guests and interested
 * people are the trip's is the service's to check, against the database.
 */
export function parseRoomPlanLayout(raw: unknown): RoomPlanLayout {
  if (!raw || typeof raw !== 'object') fail('Expected a layout')
  const body = raw as Body
  const sections = list(body, 'sections', PLAN_MAX_SECTIONS).map(section)
  if (!sections.length) fail('A plan has at least one part of the house')
  if (sections[0].beside) fail('The first part of the house can’t sit beside another')
  if (new Set(sections.map((s) => s.id)).size !== sections.length) fail('Two parts share an id')
  const tiles = list(body, 'tiles', PLAN_MAX_TILES).map((t) => tile(t, sections))
  if (new Set(tiles.map((t) => t.id)).size !== tiles.length) fail('Two tiles share an id')
  const roomTiles = tiles.flatMap((t) => (t.roomId ? [t.roomId] : []))
  if (new Set(roomTiles).size !== roomTiles.length) fail('A room is on the plan twice')
  const spots = list(body, 'spots', 400).map(spot)
  if (new Set(spots.map((s) => `${s.roomId}:${s.index}`)).size !== spots.length)
    fail('Two people are on the same place')
  const people = spots.flatMap((s) => [s.guestId, s.interestId].filter(Boolean))
  if (new Set(people).size !== people.length) fail('Someone is on the plan twice')
  const waiting = body.waiting === undefined ? [] : body.waiting
  if (
    !Array.isArray(waiting) ||
    waiting.length > 100 ||
    waiting.some((n) => typeof n !== 'string' || !n.trim() || n.trim().length > PLAN_NAME_MAX)
  )
    fail(`waiting must be a list of up to 100 names of at most ${PLAN_NAME_MAX} characters`)
  return { sections, tiles, spots, waiting: (waiting as string[]).map((n) => n.trim()) }
}

export function parseApplyRoomPlan(raw: unknown): ApplyRoomPlanInput {
  if (!raw || typeof raw !== 'object') fail('Expected { email, draftAt }')
  const body = raw as Body
  return { email: bool(body, 'email'), draftAt: text(body, 'draftAt', 40) }
}

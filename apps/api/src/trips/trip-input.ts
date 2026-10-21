import { BadRequestException } from '@nestjs/common'
import {
  HIGHLIGHT_ICONS,
  BED_TYPES,
  MAX_TRIP_PHOTOS,
  MAX_TRIP_ROOMS,
  type HighlightIcon,
  type TripHighlight,
  type TripInput,
  type TripKeyDate,
  type TripPhoto,
  type TripRoom,
  type BedType,
  type GuestUpdate,
  type RegistrationInput,
} from './trip-types'

const DATE = /^\d{4}-\d{2}-\d{2}$/

type Body = Record<string, unknown>

function fail(message: string): never {
  throw new BadRequestException(message)
}

function text(body: Body, key: string, max: number, required = true): string {
  const value = body[key]
  if (typeof value !== 'string') fail(`${key} must be text`)
  const trimmed = value.trim()
  if (required && !trimmed) fail(`${key} is required`)
  if (trimmed.length > max) fail(`${key} must be at most ${max} characters`)
  return trimmed
}

function date(body: Body, key: string): string {
  const value = text(body, key, 10)
  if (!DATE.test(value) || Number.isNaN(Date.parse(value)))
    fail(`${key} must be a date (YYYY-MM-DD)`)
  return value
}

function int(body: Body, key: string, min: number, max: number): number {
  const value = body[key]
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max)
    fail(`${key} must be a whole number from ${min} to ${max}`)
  return value
}

function bool(body: Body, key: string): boolean {
  const value = body[key]
  if (typeof value !== 'boolean') fail(`${key} must be true or false`)
  return value
}

function list(body: Body, key: string, max: number): Body[] {
  const value = body[key]
  if (!Array.isArray(value)) fail(`${key} must be a list`)
  if (value.length > max) fail(`A trip can have at most ${max} ${key}`)
  return value.map((item) =>
    item && typeof item === 'object' ? (item as Body) : fail(`${key} has a bad entry`)
  )
}

function photo(item: Body): TripPhoto {
  const url = text(item, 'url', 2000)
  if (!/^(https?:\/\/|\/(?!\/))/.test(url)) fail('A photo URL must start with http(s):// or /')
  return { url, caption: text(item, 'caption', 120, false) }
}

function highlight(item: Body): TripHighlight {
  const icon = item.icon
  if (!HIGHLIGHT_ICONS.includes(icon as HighlightIcon))
    fail(`icon must be one of ${HIGHLIGHT_ICONS.join(', ')}`)
  return {
    title: text(item, 'title', 60),
    detail: text(item, 'detail', 160, false),
    icon: icon as HighlightIcon,
  }
}

function keyDate(item: Body): TripKeyDate {
  return { date: date(item, 'date'), label: text(item, 'label', 160) }
}

/** Checks a trip body from the organizer editor and returns it cleaned up, or throws a 400 naming the problem. */
export function parseTripInput(raw: unknown): TripInput {
  if (!raw || typeof raw !== 'object') fail('Expected a trip')
  const body = raw as Body
  const startDate = date(body, 'startDate')
  const endDate = date(body, 'endDate')
  if (endDate < startDate) fail('endDate must be on or after startDate')
  const maxGuests =
    body.maxGuests === null || body.maxGuests === undefined ? null : int(body, 'maxGuests', 1, 200)
  const payFirst = body.payFirst === undefined ? false : bool(body, 'payFirst')
  const refundPledge = body.refundPledge === undefined ? false : bool(body, 'refundPledge')
  if (payFirst && !refundPledge)
    fail(
      'To have guests pay before registering, agree to refund anyone who pays but doesn’t get a spot'
    )
  return {
    name: text(body, 'name', 80),
    destination: text(body, 'destination', 80),
    startDate,
    endDate,
    organizerName: text(body, 'organizerName', 60),
    description: text(body, 'description', 2000, false),
    costPerPersonCents: int(body, 'costPerPersonCents', 0, 100_000_00),
    installmentCount: int(body, 'installmentCount', 1, 24),
    galleryTitle: text(body, 'galleryTitle', 40, false) || 'Photos',
    showGuestNames: bool(body, 'showGuestNames'),
    paymentInstructions: text(body, 'paymentInstructions', 1000, false),
    published: bool(body, 'published'),
    photos: list(body, 'photos', MAX_TRIP_PHOTOS).map(photo),
    highlights: list(body, 'highlights', 8).map(highlight),
    keyDates: list(body, 'keyDates', 20)
      .map(keyDate)
      .sort((a, b) => a.date.localeCompare(b.date)),
    maxGuests,
    payFirst,
    refundPledge,
  }
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * The trip link the organizer chose (`/t/<slug>`), or undefined to keep the current one (or generate one for a
 * new trip). Lowercase letters, numbers and single hyphens, 3 to 60 characters.
 */
export function parseSlug(raw: unknown): string | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const value = (raw as Body).slug
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string') fail('The trip link must be text')
  const slug = value.trim().toLowerCase()
  if (slug.length < 3 || slug.length > 60) fail('The trip link must be 3 to 60 characters')
  if (!SLUG.test(slug))
    fail('The trip link can use only letters, numbers and single hyphens, like mv-2027')
  return slug
}

/** Checks the room list from the Trip Control panel, in the organizer's order. */
export function parseRooms(raw: unknown): TripRoom[] {
  if (!raw || typeof raw !== 'object') fail('Expected rooms')
  return list(raw as Body, 'rooms', MAX_TRIP_ROOMS).map((item) => {
    const weight = item.weight
    if (typeof weight !== 'number' || !(weight > 0) || weight > 10)
      fail('A room weight must be a number above 0 and at most 10')
    const id = typeof item.id === 'string' && item.id ? item.id : undefined
    const capacity = int(item, 'capacity', 1, 20)
    const bedTypes = item.bedTypes === undefined ? [] : item.bedTypes
    if (
      !Array.isArray(bedTypes) ||
      bedTypes.length > 8 ||
      bedTypes.some((b) => !BED_TYPES.includes(b as BedType))
    )
      fail(`bedTypes must be a list of up to 8 of ${BED_TYPES.join(', ')}`)
    const minPeople = item.minPeople === undefined ? 1 : int(item, 'minPeople', 1, 20)
    if (minPeople > capacity) fail('A room can’t need more people than it sleeps')
    return {
      ...(id ? { id } : {}),
      name: text(item, 'name', 60),
      beds: text(item, 'beds', 120, false),
      capacity,
      weight,
      bedTypes: bedTypes as BedType[],
      minPeople,
    }
  })
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Checks a sign-up from the trip page. Messages say what to fix, because the form shows them as they are. */
export function parseRegistration(raw: unknown): RegistrationInput {
  if (!raw || typeof raw !== 'object') fail('Send the form as JSON')
  const body = raw as Body
  const name = text(body, 'name', 120)
  const phone = text(body, 'phone', 40)
  if (phone.replace(/\D/g, '').length < 7) fail('Phone must be a phone number')
  const email = text(body, 'email', 254)
  if (!EMAIL.test(email)) fail('Email must be an email address')
  const roomId = typeof body.roomId === 'string' && body.roomId ? body.roomId : null
  const roomNote = body.roomNote === undefined ? '' : text(body, 'roomNote', 200, false)
  return {
    name,
    phone,
    email: email.toLowerCase(),
    paymentSent: body.paymentSent === true,
    roomId,
    roomNote,
  }
}

/** "Jordan Price" → ["Jordan", "Price"]; everything after the first word is the last name. */
export function splitName(name: string): [string, string] {
  const [first, ...rest] = name.trim().split(/\s+/)
  return [first, rest.join(' ')]
}

export function parseGuestUpdate(raw: unknown): GuestUpdate {
  if (!raw || typeof raw !== 'object') fail('Expected a guest update')
  const body = raw as Body
  const update: GuestUpdate = {}
  if (body.status !== undefined) {
    if (body.status !== 'interested' && body.status !== 'approved')
      fail('status must be interested or approved')
    update.status = body.status
  }
  if (body.paymentConfirmed !== undefined) update.paymentConfirmed = bool(body, 'paymentConfirmed')
  if (body.roomId !== undefined) {
    if (body.roomId !== null && typeof body.roomId !== 'string')
      fail('roomId must be a room or null')
    update.roomId = body.roomId || null
  }
  return update
}

import { BadRequestException } from '@nestjs/common'
import { isPhotoRef, photoBucket } from '../photos/photo-bucket'
import {
  HIGHLIGHT_ICONS,
  BED_TYPES,
  DEFAULT_TRIP_OPTIONS,
  MAX_TRIP_PHOTOS,
  MAX_TRIP_ROOMS,
  type HighlightIcon,
  type TripHighlight,
  type TripInput,
  type TripOptions,
  type TripKeyDate,
  type TripPhoto,
  type TripRoom,
  type BedType,
  type GuestUpdate,
  type JoinInput,
  type JoinMode,
  PAYMENT_METHOD_KINDS,
  type PaymentDecision,
  type PaymentLog,
  type PaymentMethod,
  type PaymentMethodKind,
  type PaymentReport,
  type SystemSettings,
  type OrganizerRequestInput,
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
  const given = text(item, 'url', 2000)
  // The editor sends back the signed links it was given; the trip keeps the photo's reference, not the link.
  const url = isPhotoRef(given) ? given : (photoBucket()?.refFrom(given) ?? given)
  if (!isPhotoRef(url) && !/^(https?:\/\/|\/(?!\/))/.test(url))
    fail('A photo URL must start with http(s):// or /')
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

function paymentMethod(item: Body): PaymentMethod {
  const kind = item.kind
  if (!PAYMENT_METHOD_KINDS.some((k) => k.kind === kind))
    fail(
      `A payment method's kind must be one of ${PAYMENT_METHOD_KINDS.map((k) => k.kind).join(', ')}`
    )
  const custom = kind === 'custom'
  return {
    kind: kind as PaymentMethodKind,
    label: custom ? text(item, 'label', 40) : '',
    // A custom method may be just its name ("Pay in person").
    handle: text(item, 'handle', 120, !custom),
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
  const joinMode = body.joinMode === undefined ? 'accept_first' : body.joinMode
  const refundPolicy = body.refundPolicy === undefined ? 'spot_filled' : body.refundPolicy
  if (refundPolicy !== 'spot_filled' && refundPolicy !== 'first_payment_kept')
    fail('refundPolicy must be spot_filled or first_payment_kept')
  if (!JOIN_MODES.includes(joinMode as JoinMode))
    fail('joinMode must be accept_first, pay_first or first_come')
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
    paymentMethods:
      body.paymentMethods === undefined ? [] : list(body, 'paymentMethods', 8).map(paymentMethod),
    paymentInstructions: text(body, 'paymentInstructions', 1000, false),
    published: bool(body, 'published'),
    photos: list(body, 'photos', MAX_TRIP_PHOTOS).map(photo),
    highlights: list(body, 'highlights', 8).map(highlight),
    keyDates: list(body, 'keyDates', 20)
      .map(keyDate)
      .sort((a, b) => a.date.localeCompare(b.date)),
    maxGuests,
    joinMode: joinMode as JoinMode,
    refundPolicy,
    options: parseOptions(body.options),
  }
}

/** The trip's options: known keys only, each checked; a missing one takes its default. */
export function parseOptions(raw: unknown): TripOptions {
  if (raw === undefined || raw === null) return { ...DEFAULT_TRIP_OPTIONS }
  if (typeof raw !== 'object' || Array.isArray(raw)) fail('options must be an object')
  const body = raw as Body
  const flag = (key: keyof TripOptions) =>
    body[key] === undefined ? (DEFAULT_TRIP_OPTIONS[key] as boolean) : bool(body, key)
  const roomChoice = flag('roomChoice')
  return {
    roomChoice,
    roomRequired: roomChoice && flag('roomRequired'),
    signupNote: body.signupNote === undefined ? '' : text(body, 'signupNote', 500, false),
  }
}

const JOIN_MODES: JoinMode[] = ['accept_first', 'pay_first', 'first_come']

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

// Domain parts split at each dot, so no two parts of the pattern can match the same text (no slow backtracking).
const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/

/** "  Jordan   Price " → "jordan price": how a typed signature is compared with the name on the form. */
export const sameName = (a: string, b: string): boolean =>
  a.trim().replace(/\s+/g, ' ').toLowerCase() === b.trim().replace(/\s+/g, ' ').toLowerCase()

/**
 * Checks a join from the join page: the guest's details and their signature. Messages say what to fix, because the
 * page shows them as they are.
 */
export function parseJoin(raw: unknown): JoinInput {
  if (!raw || typeof raw !== 'object') fail('Send the form as JSON')
  const body = raw as Body
  const name = text(body, 'name', 120)
  const phone = text(body, 'phone', 40)
  if (phone.replace(/\D/g, '').length < 7) fail('Phone must be a phone number')
  const email = text(body, 'email', 254)
  if (!EMAIL.test(email)) fail('Email must be an email address')
  const roomId = typeof body.roomId === 'string' && body.roomId ? body.roomId : null
  const roomNote = body.roomNote === undefined ? '' : text(body, 'roomNote', 200, false)
  const typedName = text(body, 'typedName', 120)
  if (!sameName(typedName, name)) fail('Type your full name exactly as you wrote it above')
  if (body.agreed !== true) fail('Tick “I agree” to sign')
  const agreementHash = text(body, 'agreementHash', 64)
  const termsVersion = body.termsVersion === undefined ? undefined : text(body, 'termsVersion', 64)
  if (termsVersion !== undefined && body.termsAgreed !== true)
    fail('Tick the box to agree to CrewControl’s Terms of Use')
  return {
    name,
    phone,
    email: email.toLowerCase(),
    roomId,
    roomNote,
    typedName: typedName.replace(/\s+/g, ' '),
    agreed: true,
    agreementHash,
    ...(termsVersion === undefined ? {} : { termsVersion, termsAgreed: true }),
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
    if (body.status !== 'interested' && body.status !== 'approved' && body.status !== 'declined')
      fail('status must be interested, approved or declined')
    update.status = body.status
  }
  if (body.refundSent !== undefined) update.refundSent = bool(body, 'refundSent')
  if (body.offerSpot !== undefined) update.offerSpot = bool(body, 'offerSpot')
  if (body.roomId !== undefined) {
    if (body.roomId !== null && typeof body.roomId !== 'string')
      fail('roomId must be a room or null')
    update.roomId = body.roomId || null
  }
  return update
}

/** Up to $100,000 in whole cents, as trip prices go. */
const cents = (body: Body, key: string) => int(body, key, 1, 100_000_00)

/** A guest reporting a payment. The amount against what is due is checked where the guest's balance is known. */
export function parsePaymentReport(raw: unknown): PaymentReport {
  if (!raw || typeof raw !== 'object') fail('Expected a payment')
  const body = raw as Body
  if (body.certified !== true) fail('Tick "I sent this payment" to report it')
  return {
    guestPaymentAmount: cents(body, 'guestPaymentAmount'),
    // Null when the trip lists no ways to pay (its note says how).
    methodIndex: body.methodIndex === null ? null : int(body, 'methodIndex', 0, 7),
    sentOn: date(body, 'sentOn'),
    note: text(body, 'note', 500, false),
    certified: true,
  }
}

export function parsePaymentDecision(raw: unknown): PaymentDecision {
  if (!raw || typeof raw !== 'object') fail('Expected a decision')
  const body = raw as Body
  if (body.status !== 'confirmed' && body.status !== 'not_received' && body.status !== 'reported')
    fail('status must be confirmed, not_received or reported')
  if (body.status !== 'confirmed' || body.receivedPaymentAmount === undefined)
    return { status: body.status }
  return {
    status: 'confirmed',
    // Nothing arrived is "not received", never a confirmation of $0.
    receivedPaymentAmount: cents(body, 'receivedPaymentAmount'),
  }
}

export function parsePaymentLog(raw: unknown): PaymentLog {
  if (!raw || typeof raw !== 'object') fail('Expected a payment')
  const body = raw as Body
  return {
    receivedPaymentAmount: cents(body, 'receivedPaymentAmount'),
    method: text(body, 'method', 160),
    sentOn: date(body, 'sentOn'),
    note: text(body, 'note', 500, false),
  }
}

export function parseSystemSettings(raw: unknown): SystemSettings {
  if (!raw || typeof raw !== 'object') fail('Expected settings')
  return { waitlistBufferPercent: int(raw as Body, 'waitlistBufferPercent', 0, 100) }
}

export function parseOrganizerRequest(raw: unknown): OrganizerRequestInput {
  if (!raw || typeof raw !== 'object') fail('Expected a request')
  const body = raw as Body
  if (body.kind !== 'refund_terms') fail('kind must be refund_terms')
  return {
    kind: 'refund_terms',
    tripId: typeof body.tripId === 'string' && body.tripId ? body.tripId : undefined,
    text: text(body, 'text', 2000),
  }
}

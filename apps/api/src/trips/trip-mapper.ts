import type { Guest as GuestRow, Trip as TripRow } from '@prisma/client'
import type {
  Guest,
  GuestStatus,
  OrganizerTrip,
  PublicTrip,
  TripHighlight,
  TripKeyDate,
  TripPhoto,
  TripSummary,
} from './trip-types'

type TripWithGuests = TripRow & { guests: GuestRow[] }

/** What the public page gets of a guest (public_trip_guests): a status, and a name only once approved. */
export type PublicGuestRow = { status: string; firstName: string | null; lastName: string | null }

const photos = (row: TripRow) => row.photos as unknown as TripPhoto[]

/** "Jordan" + "Price" → "Jordan P.": enough for friends to recognise, not a full name on a public page. */
export function shortName(firstName: string, lastName: string): string {
  const initial = lastName.trim().charAt(0).toUpperCase()
  return initial ? `${firstName.trim()} ${initial}.` : firstName.trim()
}

/**
 * The guest-facing view. Payment instructions and guest contact details never leave the API this way,
 * and people who only registered interest are counted, never named.
 */
export function toPublicTrip(row: TripRow & { guests: PublicGuestRow[] }): PublicTrip {
  const approved = row.guests.filter((g) => g.status === 'approved')
  return {
    slug: row.slug,
    name: row.name,
    destination: row.destination,
    startDate: row.startDate,
    endDate: row.endDate,
    organizerName: row.organizerName,
    description: row.description,
    costPerPersonCents: row.costPerPersonCents,
    installmentCount: row.installmentCount,
    photos: photos(row),
    galleryTitle: row.galleryTitle,
    highlights: row.highlights as unknown as TripHighlight[],
    keyDates: row.keyDates as unknown as TripKeyDate[],
    goingCount: approved.length,
    interestedCount: row.guests.length - approved.length,
    guestNames: row.showGuestNames
      ? approved.map((g) => shortName(g.firstName ?? '', g.lastName ?? ''))
      : null,
    isSample: row.isSample,
  }
}

function toGuest(row: GuestRow): Guest {
  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    phone: row.phone,
    status: row.status as GuestStatus,
  }
}

export function toOrganizerTrip(row: TripWithGuests): OrganizerTrip {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    destination: row.destination,
    startDate: row.startDate,
    endDate: row.endDate,
    organizerName: row.organizerName,
    description: row.description,
    costPerPersonCents: row.costPerPersonCents,
    installmentCount: row.installmentCount,
    galleryTitle: row.galleryTitle,
    showGuestNames: row.showGuestNames,
    paymentInstructions: row.paymentInstructions,
    published: row.published,
    photos: photos(row),
    highlights: row.highlights as unknown as TripHighlight[],
    keyDates: row.keyDates as unknown as TripKeyDate[],
    guests: row.guests.map(toGuest),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export function toTripSummary(row: TripRow): TripSummary {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    destination: row.destination,
    startDate: row.startDate,
    endDate: row.endDate,
    published: row.published,
    coverUrl: photos(row)[0]?.url ?? null,
    isSample: row.isSample,
  }
}

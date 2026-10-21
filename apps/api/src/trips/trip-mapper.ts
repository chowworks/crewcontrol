import type { Guest as GuestRow, Room as RoomRow, Trip as TripRow } from '@prisma/client'
import type {
  BedType,
  Guest,
  GuestStatus,
  OrganizerTrip,
  PublicTrip,
  TripHighlight,
  TripKeyDate,
  TripPhoto,
  TripSummary,
} from './trip-types'

type TripWithGuests = TripRow & { guests: GuestRow[]; rooms?: RoomRow[] }

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
export function toPublicTrip(
  row: TripRow & {
    guests: PublicGuestRow[]
    rooms?: RoomRow[]
    /** How many guests asked for each room (public_room_taken), never who. */
    roomTaken?: Map<string, number>
    /** Spots taken against the limit (public_spots_taken); approved guests when not given. */
    spotsTaken?: number
  }
): PublicTrip {
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
    spotsTaken: row.spotsTaken ?? approved.length,
    interestedCount: row.guests.length - approved.length,
    guestNames: row.showGuestNames
      ? approved.map((g) => shortName(g.firstName ?? '', g.lastName ?? ''))
      : null,
    isSample: row.isSample,
    maxGuests: row.maxGuests,
    payFirst: row.payFirst,
    // Pay-first guests pay before they register, so they need to know how. Otherwise approved guests only.
    paymentInstructions: row.payFirst ? row.paymentInstructions : null,
    // Places left counts everyone who asked for the room; the organizer can move people.
    rooms: (row.rooms ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      beds: r.beds,
      bedTypes: r.bedTypes as BedType[],
      capacity: r.capacity,
      minPeople: r.minPeople,
      spotsLeft: Math.max(0, r.capacity - (row.roomTaken?.get(r.id) ?? 0)),
    })),
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
    createdAt: row.createdAt.toISOString(),
    paymentSentAt: row.paymentSentAt?.toISOString() ?? null,
    paymentConfirmedAt: row.paymentConfirmedAt?.toISOString() ?? null,
    roomId: row.roomId,
    roomNote: row.roomNote,
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
    maxGuests: row.maxGuests,
    payFirst: row.payFirst,
    refundPledge: row.refundPledge,
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

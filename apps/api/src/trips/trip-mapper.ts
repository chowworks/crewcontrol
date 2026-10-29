import type {
  AgreementSignature as SignatureRow,
  BalanceAdjustment as AdjustmentRow,
  Guest as GuestRow,
  Payment as PaymentRow,
  Room as RoomRow,
  Trip as TripRow,
} from '@prisma/client'
import { termsOf } from '../join/agreement'
import {
  DEFAULT_TRIP_OPTIONS,
  type BalanceAdjustment,
  type BedType,
  type Guest,
  type GuestStatus,
  type JoinMode,
  type OrganizerTrip,
  type Payment,
  type PaymentMethod,
  type PublicTrip,
  type RefundPolicy,
  type SignedAgreement,
  type TripHighlight,
  type TripKeyDate,
  type TripOptions,
  type TripPhoto,
  type TripSummary,
} from './trip-types'

type GuestWithAgreement = GuestRow & {
  agreement?: SignatureRow | null
  payments?: PaymentRow[]
  adjustments?: AdjustmentRow[]
}
type TripWithGuests = TripRow & { guests: GuestWithAgreement[]; rooms?: RoomRow[] }

/** What the public page gets of a guest (public_trip_guests): a status, and a name only once approved. */
export type PublicGuestRow = { status: string; firstName: string | null; lastName: string | null }

const photos = (row: TripRow) => row.photos as unknown as TripPhoto[]

/** The trip's options as stored, with a default for any the trip was saved without. */
export const optionsOf = (row: TripRow): TripOptions => ({
  ...DEFAULT_TRIP_OPTIONS,
  ...(row.options as Partial<TripOptions> | null),
})

/** "Jordan" + "Price" → "Jordan P.": enough for friends to recognise, not a full name on a public page. */
export function shortName(firstName: string, lastName: string): string {
  const initial = lastName.trim().charAt(0).toUpperCase()
  return initial ? `${firstName.trim()} ${initial}.` : firstName.trim()
}

/**
 * The guest-facing view. Payment instructions and guest contact details never leave the API this way (a guest who
 * joined gets the instructions on their own join page, never here), and people not yet accepted are counted, never
 * named.
 */
export function toPublicTrip(
  row: TripRow & {
    guests: PublicGuestRow[]
    rooms?: RoomRow[]
    /** How many guests asked for each room (public_room_taken), never who. */
    roomTaken?: Map<string, number>
    /** Spots taken against the limit (public_spots_taken); approved guests when not given. */
    spotsTaken?: number
    /** Whether joining now goes on the waitlist (public_trip_waitlisting). */
    waitlisting?: boolean
  }
): PublicTrip {
  const approved = row.guests.filter((g) => g.status === 'approved')
  const options = optionsOf(row)
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
    waitlisting: row.waitlisting ?? false,
    interestedCount: row.guests.filter((g) => g.status === 'interested').length,
    // With room choice on, guests see who's going, so they can choose who to share with.
    guestNames:
      row.showGuestNames || options.roomChoice
        ? approved.map((g) => shortName(g.firstName ?? '', g.lastName ?? ''))
        : null,
    isSample: row.isSample,
    maxGuests: row.maxGuests,
    joinMode: row.joinMode as JoinMode,
    refundPolicy: row.refundPolicy as RefundPolicy,
    // Places left counts everyone who asked for the room; the organizer can move people.
    // Organizer-only options (vendor costs) stay off the guest's page.
    options: {
      roomChoice: options.roomChoice,
      roomRequired: options.roomRequired,
      signupNote: options.signupNote,
    },
    rooms: (options.roomChoice ? (row.rooms ?? []) : []).map((r) => ({
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

export function toSignedAgreement(sig: SignatureRow): SignedAgreement {
  return {
    text: sig.text,
    textHash: sig.textHash,
    templateVersion: sig.templateVersion,
    typedName: sig.typedName,
    signedAt: sig.signedAt.toISOString(),
    ipAddress: sig.ipAddress,
    userAgent: sig.userAgent,
  }
}

export function toPayment(row: PaymentRow): Payment {
  return {
    id: row.id,
    guestPaymentAmount: row.guestPaymentAmount,
    receivedPaymentAmount: row.receivedPaymentAmount,
    method: row.method,
    methodKind: row.methodKind as Payment['methodKind'],
    sentOn: row.sentOn,
    note: row.note,
    status: row.status as Payment['status'],
    loggedBy: row.loggedBy as Payment['loggedBy'],
    paidByName: row.paidByName,
    transferId: row.transferId,
    reportedAt: row.reportedAt.toISOString(),
    decidedAt: row.decidedAt?.toISOString() ?? null,
  }
}

/** A guest's payments, oldest first. */
export const paymentsOf = (rows: PaymentRow[] | undefined): Payment[] =>
  [...(rows ?? [])].sort((a, b) => a.reportedAt.getTime() - b.reportedAt.getTime()).map(toPayment)

/** A guest's balance adjustments, removed ones too, oldest first. */
export const adjustmentsOf = (rows: AdjustmentRow[] | undefined): BalanceAdjustment[] =>
  [...(rows ?? [])]
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((row) => ({
      id: row.id,
      kind: row.kind as BalanceAdjustment['kind'],
      amountCents: row.amountCents,
      reason: row.reason,
      createdAt: row.createdAt.toISOString(),
      removedAt: row.removedAt?.toISOString() ?? null,
    }))

export const paymentMethodsOf = (row: Pick<TripRow, 'paymentMethods'>): PaymentMethod[] =>
  (row.paymentMethods as unknown as PaymentMethod[] | null) ?? []

/**
 * `all` is every guest on the trip, to name who looks after this one: the guest with that account if they're on the
 * trip, otherwise the name they signed this traveler's agreement with.
 */
function toGuest(row: GuestWithAgreement, all: GuestWithAgreement[]): Guest {
  const payments = paymentsOf(row.payments)
  const adjustments = adjustmentsOf(row.adjustments)
  const manager = row.managedByUserId
    ? all.find((g) => g.userId === row.managedByUserId)
    : undefined
  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    phone: row.phone,
    status: row.status as GuestStatus,
    createdAt: row.createdAt.toISOString(),
    spotPaidAt: row.spotPaidAt?.toISOString() ?? null,
    refundSentAt: row.refundSentAt?.toISOString() ?? null,
    waitlistedAt: row.waitlistedAt?.toISOString() ?? null,
    offeredAt: row.offeredAt?.toISOString() ?? null,
    payments,
    adjustments,
    roomId: row.roomId,
    roomNote: row.roomNote,
    signedAt: row.agreement?.signedAt.toISOString() ?? null,
    terms: row.agreement ? termsOf(row.agreement, payments, adjustments) : null,
    hasAccount: row.userId !== null,
    managedBy: row.managedByUserId
      ? {
          guestId: manager?.id ?? null,
          name: manager
            ? `${manager.firstName} ${manager.lastName}`
            : (row.agreement?.typedName ?? 'Someone else'),
        }
      : null,
  }
}

/** `waitlistBufferPercent` is the system setting (SystemSettings), handed along for Trip Control's waitlist. */
export function toOrganizerTrip(row: TripWithGuests, waitlistBufferPercent: number): OrganizerTrip {
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
    paymentMethods: paymentMethodsOf(row),
    paymentInstructions: row.paymentInstructions,
    published: row.published,
    photos: photos(row),
    highlights: row.highlights as unknown as TripHighlight[],
    keyDates: row.keyDates as unknown as TripKeyDate[],
    maxGuests: row.maxGuests,
    joinMode: row.joinMode as JoinMode,
    refundPolicy: row.refundPolicy as RefundPolicy,
    options: optionsOf(row),
    guests: row.guests.map((g) => toGuest(g, row.guests)),
    updatedAt: row.updatedAt.toISOString(),
    waitlistBufferPercent,
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

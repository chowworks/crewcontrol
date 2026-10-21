// Generated from packages/types/src/index.ts by `npm run sync:types`. Do not edit.

// Shared shapes between the API and the web app. Money is integer cents; calendar dates are 'YYYY-MM-DD'.

export const HIGHLIGHT_ICONS = [
  'home',
  'hotel',
  'beach',
  'plane',
  'ferry',
  'car',
  'food',
  'drink',
  'activity',
  'star',
] as const
export type HighlightIcon = (typeof HIGHLIGHT_ICONS)[number]

export interface TripHighlight {
  title: string
  detail: string
  icon: HighlightIcon
}

export interface TripPhoto {
  url: string
  caption: string
}

export interface TripKeyDate {
  date: string
  label: string
}

/** What a guest sees on the public trip page. Never carries payment instructions or contact details. */
export interface PublicTrip {
  slug: string
  name: string
  destination: string
  startDate: string
  endDate: string
  organizerName: string
  description: string
  costPerPersonCents: number
  installmentCount: number
  /** The first photo is the cover; the rest fill the gallery. */
  photos: TripPhoto[]
  galleryTitle: string
  highlights: TripHighlight[]
  keyDates: TripKeyDate[]
  goingCount: number
  interestedCount: number
  /** Approved guests as "First L.", or null when the organizer hides names. */
  guestNames: string[] | null
  /** A demo trip from the seed, shown with a "Sample Trip" badge. */
  isSample: boolean
  maxGuests: number | null
  payFirst: boolean
  /** How to pay the organizer: shown publicly only on pay-first trips, where guests pay before registering. */
  paymentInstructions: string | null
  /** Rooms guests can ask for, with how many places are still open. */
  rooms: PublicRoom[]
  /** Spots taken against maxGuests: approved guests, and on pay-first trips also guests who say they've paid. */
  spotsTaken: number
}

export type GuestStatus = 'interested' | 'approved'

/** A person's part in running a trip (TripMember.role): the owner decides who else organizes it. */
export type TripRole = 'owner' | 'organizer'

export interface Guest {
  id: string
  firstName: string
  lastName: string
  email: string
  phone: string
  status: GuestStatus
  /** ISO times: registered, said they sent the first payment, organizer confirmed it arrived. */
  createdAt: string
  paymentSentAt: string | null
  paymentConfirmedAt: string | null
  roomId: string | null
  /** Who they'd like to share with, in their words. */
  roomNote: string
}

/** The editable fields of a trip. Saving replaces the photo, highlight and key date lists whole. */
export interface TripInput {
  name: string
  destination: string
  startDate: string
  endDate: string
  organizerName: string
  description: string
  costPerPersonCents: number
  installmentCount: number
  galleryTitle: string
  showGuestNames: boolean
  paymentInstructions: string
  published: boolean
  photos: TripPhoto[]
  highlights: TripHighlight[]
  keyDates: TripKeyDate[]
  /** The most guests the trip takes; null for no limit. */
  maxGuests: number | null
  /** Guests confirm they've sent the first installment when they register. Needs refundPledge. */
  payFirst: boolean
  /** The organizer refunds anyone who paid but didn't get a spot because the trip filled. */
  refundPledge: boolean
}

export interface OrganizerTrip extends TripInput {
  id: string
  slug: string
  guests: Guest[]
  updatedAt: string
}

export interface TripSummary {
  id: string
  slug: string
  name: string
  destination: string
  startDate: string
  endDate: string
  published: boolean
  coverUrl: string | null
  isSample: boolean
}

export const MAX_TRIP_PHOTOS = 15

// The contact form (POST /api/contact). `?topic=` on /contact prefills one of these.
export const CONTACT_TOPICS = [
  'question',
  'trip-help',
  'app-problem',
  'privacy',
  'feedback',
] as const
export type ContactTopic = (typeof CONTACT_TOPICS)[number]
export const CONTACT_TOPIC_LABELS: Record<ContactTopic, string> = {
  question: 'A question about CrewControl',
  'trip-help': 'Help with a trip',
  'app-problem': 'App Problem / Navigation Issue',
  privacy: 'Privacy or my data',
  feedback: 'Feedback or an idea',
}

export interface ContactInput {
  name: string
  email: string
  topic: ContactTopic
  message: string
  /** Honeypot: hidden from people, so only a bot fills it in. */
  website?: string
}

/** A room or sleeping space on a trip: who fits, and how its share of the price is weighted. */
export interface TripRoom {
  /** Set once saved; keep it when editing so guests' choices stay attached. */
  id?: string
  name: string
  /** What's in it, like "King, private bath". */
  beds: string
  capacity: number
  /** Pricing weight relative to the other rooms; 1 is the baseline. */
  weight: number
  /** The beds, in order, for the room's picture. */
  bedTypes: BedType[]
  /** The fewest people the room is priced for; fewer than this pay for the empty places too. */
  minPeople: number
}

export const BED_TYPES = ['king', 'queen', 'double', 'twin', 'daybed', 'sofa-bed', 'bunk'] as const
export type BedType = (typeof BED_TYPES)[number]
export const BED_LABELS: Record<BedType, { label: string; sleeps: number }> = {
  king: { label: 'King', sleeps: 2 },
  queen: { label: 'Queen', sleeps: 2 },
  double: { label: 'Double', sleeps: 2 },
  twin: { label: 'Twin', sleeps: 1 },
  daybed: { label: 'Daybed', sleeps: 1 },
  'sofa-bed': { label: 'Pull-out sofa', sleeps: 2 },
  bunk: { label: 'Bunk bed', sleeps: 2 },
}

export const MAX_TRIP_ROOMS = 20

export interface PublicRoom {
  id: string
  name: string
  beds: string
  bedTypes: BedType[]
  capacity: number
  minPeople: number
  spotsLeft: number
}

/** What a guest sends from the trip page's sign-up form. */
export interface RegistrationInput {
  name: string
  phone: string
  email: string
  /** Required on pay-first trips: the guest confirms they've sent the first installment. */
  paymentSent: boolean
  /** Optional: the room they'd like, and who they'd share with. */
  roomId?: string | null
  roomNote?: string
}

/** The organizer's changes to one guest from the Trip Control panel. */
export interface GuestUpdate {
  status?: GuestStatus
  paymentConfirmed?: boolean
  /** Move the guest to a room, or null for no room. */
  roomId?: string | null
}

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
export const CONTACT_TOPICS = ['question', 'trip-help', 'privacy', 'feedback'] as const
export type ContactTopic = (typeof CONTACT_TOPICS)[number]
export const CONTACT_TOPIC_LABELS: Record<ContactTopic, string> = {
  question: 'A question about CrewControl',
  'trip-help': 'Help with a trip',
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

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
  /**
   * Email guests this many days before the date (0 is on the day), or no reminder when missing or null. The
   * organizer's settings: never on the public page.
   */
  remindDaysBefore?: number | null
}

/** The choices for a reminder, in days before its date. */
export const REMIND_DAYS = [0, 1, 3, 7, 14, 30] as const

/** How a trip takes its crew once guests have signed: the organizer accepts each one and then they pay
 * (accept_first), they pay and then the organizer accepts each one (pay_first), or they pay and confirming a payment
 * accepts them while spots are left (first_come). */
export type JoinMode = 'accept_first' | 'pay_first' | 'first_come'

/**
 * How refunds work when a guest drops out after they're accepted, as the trip agreement words it. Presets only, never
 * free text (owner's decision, 2026-10-26): 'spot_filled' gives money back only if the organizer fills the spot, as
 * much as the new guest pays; 'first_payment_kept' keeps the first payment and treats the rest as 'spot_filled'.
 */
export type RefundPolicy = 'spot_filled' | 'first_payment_kept'

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
  joinMode: JoinMode
  /** The payment plan the agreement quotes: each installment's amount and due date (terms, not anything private). */
  paymentPlan: PlannedPayment[]
  /** The trip agreement quotes it, so the join page needs it (terms, not anything private). */
  refundPolicy: RefundPolicy
  /** Rooms guests can ask for, with how many places are still open; empty unless room choice is on. */
  rooms: PublicRoom[]
  /** Room choice, whether a room is required, and the lines beside the sign-up button. */
  options: PublicTripOptions
  /** Spots taken against maxGuests: accepted guests. */
  spotsTaken: number
  /** Someone joining now goes on the waitlist: the trip is full (or, where guests pay first, enough people can pay). */
  waitlisting: boolean
}

/** Joining, then accepted, or turned down by the organizer. */
export type GuestStatus = 'interested' | 'approved' | 'declined'

/** A person's part in running a trip (TripMember.role): the owner decides who else organizes it. */
export type TripRole = 'owner' | 'organizer'

/** Someone who runs a trip, as its People screen lists them (name and email from sign-in). */
export interface TripPerson {
  userId: string
  name: string
  email: string
  role: TripRole
}

/** Someone invited to run a trip who hasn't signed in yet: they join with this role when they do. */
export interface TripInvite {
  email: string
  role: TripRole
}

/** A trip's People screen: who runs it, and whether the viewer may change that (its owners, and the admin). */
export interface TripPeople {
  tripName: string
  isSample: boolean
  canManage: boolean
  people: TripPerson[]
  invites: TripInvite[]
}

/** Adding someone who runs the trip by email; someone who hasn't signed in yet is invited (TripInvite). */
export interface TripPersonInput {
  email: string
  role: TripRole
  /** Email them that they were added (the default); false on Undo, which puts back someone who was already told. */
  notify?: boolean
}

export interface Guest {
  id: string
  firstName: string
  lastName: string
  email: string
  phone: string
  status: GuestStatus
  /** ISO times: joined; when confirmed payments first covered the first payment due (the spot is paid); refund sent. */
  createdAt: string
  spotPaidAt: string | null
  refundSentAt: string | null
  /** When they joined onto the waitlist (the trip was full), and when an organizer offered them a spot. */
  waitlistedAt: string | null
  offeredAt: string | null
  /** Every payment they reported or the organizer logged, oldest first. */
  payments: Payment[]
  /** The credits and charges the organizer put on their balance, removed ones too, oldest first. */
  adjustments: BalanceAdjustment[]
  roomId: string | null
  /** Who they'd like to share with, in their words. */
  roomNote: string
  /** When they signed the trip agreement, or null if they haven't (guests from before signing). */
  signedAt: string | null
  /** The terms their signed agreement quoted, which their balance uses; null if unsigned. */
  terms: GuestTerms | null
  /** Whether they have an account of their own (signed in to join, or took over a sign-up made for them). */
  hasAccount: boolean
  /**
   * Who signed them up and looks after them, when it wasn't them (a parent, a friend paying for a roommate): the guest
   * on this trip with that account, if they're on it, and the name to show. Null when they look after themselves.
   */
  managedBy: { guestId: string | null; name: string } | null
  /** Emails to them bounced, or they marked one as spam (Resend tells the API); null when nothing's wrong. */
  emailProblem: 'bounced' | 'complained' | null
  /**
   * What their room costs beyond the price they signed, not yet settled (issue #30): above zero their room costs
   * more, below zero less. The organizer settles it as a charge or credit, or leaves it; nothing changes on its own.
   */
  roomPriceDiffCents: number
}

/** What a guest's signed agreement holds them and the organizer to. Trip changes after signing never touch it. */
export interface GuestTerms {
  priceCents: number
  installmentCount: number
  startDate: string
  endDate: string
  refundTerms: string
  /** The first installment, which holds the spot: never more than the price with adjustments. */
  firstInstallmentCents: number
  /** What the organizer has confirmed arrived, in all. */
  paidCents: number
  /** Reported by the guest, waiting for the organizer. */
  pendingCents: number
  /** The organizer's adjustments that still count: charges less credits (below zero when credits are more). */
  adjustmentCents: number
  /** What is left to pay: the price, plus the adjustments, less the payments the organizer has confirmed. */
  balanceCents: number
  /**
   * The payment plan they signed, one line per installment: its amount and, when the trip had set them, its due date.
   * Agreements signed before plans had dates have none.
   */
  schedule: PlannedPayment[]
}

/** One installment of a payment plan. Amounts add up to the price; credits and charges are apart from them. */
export interface PlannedPayment {
  dueOn: string | null
  amountCents: number
}

/**
 * A trip's payment plan for a price: `count` installments, the first `firstPaymentCents` when the organizer set one
 * (never more than the price) or an even share, the rest split evenly with any odd cents on the last, each with its
 * due date when the trip has them. The agreement quotes it and the signature keeps it.
 */
export function paymentPlan(
  priceCents: number,
  count: number,
  firstPaymentCents: number | null,
  dueDates: string[]
): PlannedPayment[] {
  const n = Math.max(1, Math.floor(count))
  const due = (i: number) => dueDates[i] ?? null
  if (n === 1) return [{ dueOn: due(0), amountCents: priceCents }]
  const first = Math.min(priceCents, firstPaymentCents ?? Math.floor(priceCents / n))
  const each = Math.floor((priceCents - first) / (n - 1))
  return Array.from({ length: n }, (_, i) => ({
    dueOn: due(i),
    amountCents: i === 0 ? first : i === n - 1 ? priceCents - first - each * (n - 2) : each,
  }))
}

/**
 * A credit or charge the organizer put on a guest's balance by hand, with a reason (issue #17): "$50 off for driving
 * the van", "$40 for the extra night". Not a payment, and it never touches the signed price. Never edited: removing
 * it keeps it, marked removed, and it no longer counts.
 */
export interface BalanceAdjustment {
  id: string
  kind: 'credit' | 'charge'
  amountCents: number
  reason: string
  createdAt: string
  removedAt: string | null
}

/** The organizer adding a credit or charge to a guest's balance. */
export interface BalanceAdjustmentInput {
  kind: 'credit' | 'charge'
  amountCents: number
  reason: string
}

/** What a guest owes in all: their signed price with the adjustments that count. */
export const totalDueCents = (terms: GuestTerms): number => terms.priceCents + terms.adjustmentCents

/** The ways guests can pay an organizer that Travel HQ knows by name, and a free-form one ("Pay in person"). */
export const PAYMENT_METHOD_KINDS = [
  { kind: 'cashapp', name: 'Cash App', handle: '$cashtag or phone number' },
  { kind: 'zelle', name: 'Zelle', handle: 'Phone number or email' },
  { kind: 'venmo', name: 'Venmo', handle: '@username' },
  { kind: 'paypal', name: 'PayPal', handle: 'Phone number, email or @username' },
  { kind: 'applecash', name: 'Apple Cash', handle: 'Phone number or email' },
  {
    kind: 'custom',
    name: 'Something else',
    handle: 'How to pay, for example "Hand it to me at dinner"',
  },
] as const
export type PaymentMethodKind = (typeof PAYMENT_METHOD_KINDS)[number]['kind']

/** One way to pay the organizer, as they listed it on the trip. */
export interface PaymentMethod {
  kind: PaymentMethodKind
  /** For a custom method only: its name ("Pay in person"). */
  label: string
  /** The handle (a $cashtag, phone, email or @username), or for a custom method how to do it. */
  handle: string
}

/** A payment method in one line: "Zelle · (555) 010-0199", "Pay in person · Hand it to me at dinner". */
export function paymentMethodLabel(m: PaymentMethod): string {
  const name =
    m.kind === 'custom'
      ? m.label.trim() || 'Other'
      : (PAYMENT_METHOD_KINDS.find((k) => k.kind === m.kind)?.name ?? 'Other')
  return m.handle.trim() ? `${name} · ${m.handle.trim()}` : name
}

/** One payment a guest sent the organizer, for any installment. Amounts are whole cents. */
export interface Payment {
  id: string
  /** What the guest says they sent. */
  guestPaymentAmount: number
  /** What the organizer confirmed arrived; null until they do. */
  receivedPaymentAmount: number | null
  /** How it was paid, as picked ("Zelle · (555) 010-0199"). */
  method: string
  methodKind: PaymentMethodKind | 'other'
  /** 'YYYY-MM-DD', the day the guest says they sent it. */
  sentOn: string
  /** Why it was less than due, in the guest's words. */
  note: string
  status: 'reported' | 'confirmed' | 'not_received' | 'refunded'
  loggedBy: 'guest' | 'organizer'
  /** Who sent it, by name, when someone paid for this traveler; '' when the traveler reported it themselves. */
  paidByName: string
  /** One transfer for several travelers: their payments share this and are decided together. Null for one person. */
  transferId: string | null
  reportedAt: string
  decidedAt: string | null
}

/** A guest reporting a payment from their join page. */
export interface PaymentReport {
  guestPaymentAmount: number
  /** Which of the trip's payment methods, by position; null when the trip lists none (its note says how). */
  methodIndex: number | null
  sentOn: string
  /** Required when the amount is less than due now. */
  note: string
  /** "I sent this payment": the guest certifies it. */
  certified: boolean
  /**
   * Who one payment covers, when it covers more than the payer (themselves and the travelers they look after), with
   * each one's share. The shares add up to `guestPaymentAmount`. Left out, it is all for the payer.
   */
  forGuests?: { guestId: string; amount: number }[]
}

/** The organizer's decision on a reported payment: it arrived (with how much), it didn't, or undo the decision. */
export interface PaymentDecision {
  status: 'confirmed' | 'not_received' | 'reported'
  /** With confirmed: what arrived. Left out, it is what the guest said they sent. */
  receivedPaymentAmount?: number
  /** With confirmed, on a transfer for several travelers: what arrived for each, by payment. Left out, as reported. */
  shares?: { paymentId: string; receivedPaymentAmount: number }[]
}

/** The organizer logging a payment handed over in person: it is confirmed as it is logged. */
export interface PaymentLog {
  receivedPaymentAmount: number
  method: string
  sentOn: string
  note: string
}

/**
 * Money the organizer pays out for the trip (the house, the resort, a chef), recorded only: Travel HQ never moves it.
 * Paid once it has a paid date; until then it is still owed, by its due date if it has one. Organizers only.
 */
export interface Expense {
  id: string
  /** Who gets paid ("Seaside Rentals"). */
  payee: string
  /** What it's for ("House deposit"). */
  description: string
  amountCents: number
  /** 'YYYY-MM-DD', the day it was paid; null while it is still owed. */
  paidOn: string | null
  /** 'YYYY-MM-DD', when it is due; optional. */
  dueOn: string | null
  createdAt: string
}

/** What the organizer types to add or change an expense. */
export type ExpenseInput = Pick<
  Expense,
  'payee' | 'description' | 'amountCents' | 'paidOn' | 'dueOn'
>

/** A signed agreement, as the guest who signed it and the trip's organizers see it. */
export interface SignedAgreement {
  text: string
  /** SHA-256 of the text, hex. */
  textHash: string
  templateVersion: string
  typedName: string
  signedAt: string
  ipAddress: string
  userAgent: string
}

/** One line of a guest's history in Trip Control, oldest first. The database writes these; nobody edits them. */
export interface GuestEvent {
  at: string
  kind:
    | 'joined'
    | 'waitlisted'
    | 'offered'
    | 'offer_withdrawn'
    | 'signed'
    | 'said_paid'
    | 'payment_confirmed'
    | 'payment_not_received'
    | 'payment_undone'
    | 'accepted'
    | 'turned_down'
    | 'put_back'
    | 'refund_sent'
    | 'refund_undone'
    | 'room_changed'
    | 'contact_changed'
    | 'credit_added'
    | 'charge_added'
    | 'credit_removed'
    | 'charge_removed'
  /** Who did it: the guest, one of the trip's organizers, or Travel HQ itself (a sample trip's setup). */
  actor: 'guest' | 'organizer' | 'system'
  /** For room_changed: the rooms' names, null for no room or a room since removed. */
  fromRoom: string | null
  toRoom: string | null
  /** For contact_changed: which details changed, never their values. */
  fields: ('name' | 'email' | 'phone')[]
  /**
   * For the payment kinds: what the guest said they sent, or with payment_confirmed what arrived (whole cents). For the
   * adjustment kinds, the adjustment's amount.
   */
  amount: number | null
  /** For the adjustment kinds: the organizer's reason, and the organizer's name. */
  reason: string | null
  byName: string | null
}

/**
 * One line of the trip log in Trip Control, newest first: a join refused because the email is already on the trip
 * (what was typed, from where, and whether it hit the limit of three every ten minutes), the admin seating
 * themselves on or opening the trip, or a line of a guest's history.
 */
export type TripLogEntry =
  | {
      kind: 'email_refused'
      at: string
      name: string
      email: string
      phone: string
      ipAddress: string
      userAgent: string
      blocked: boolean
    }
  | {
      /** A change to who runs the trip (an owner's or the admin's), or the admin opening it. */
      kind: 'people'
      at: string
      action: 'insert' | 'update' | 'delete' | 'open'
      /** The admin did it: the log says "An admin", not their name. */
      byAdmin: boolean
      actorName: string
      subjectName: string
      /** They changed their own place (stepped down, or the admin added itself). */
      self: boolean
      role: TripRole | null
      oldRole: TripRole | null
    }
  | { kind: 'guest'; at: string; guestId: string; guestName: string; event: GuestEvent }

/** The editable fields of a trip. Saving replaces the photo, highlight and key date lists whole. */
/**
 * Trip settings that only change what the pages show, kept together in one field (Trip.options) so a new one needs
 * no database change. A setting the database must enforce (the join mode) stays its own column.
 */
export interface TripOptions {
  /** Guests pick a room when they sign up, from the trip's rooms. */
  roomChoice: boolean
  /** With roomChoice: a guest can't sign up without picking a room. */
  roomRequired: boolean
  /** A few lines guests read beside the sign-up button. */
  signupNote: string
  /** Trip Financials tracks what the organizer pays vendors (issue #16). Organizer-only: never on a guest's page. */
  vendorCosts: boolean
}

export const DEFAULT_TRIP_OPTIONS: TripOptions = {
  roomChoice: false,
  roomRequired: false,
  signupNote: '',
  vendorCosts: false,
}

/** The options a guest's page sees: the organizer-only ones left out. */
export type PublicTripOptions = Omit<TripOptions, 'vendorCosts'>

export interface TripInput {
  name: string
  destination: string
  startDate: string
  endDate: string
  organizerName: string
  description: string
  costPerPersonCents: number
  installmentCount: number
  /**
   * When each installment is due ('YYYY-MM-DD', one per installment, in order), or empty when the organizer hasn't
   * set them. Payment reminders go out from these.
   */
  paymentDueDates: string[]
  /** Email guests who still owe this many days before each due date (REMIND_DAYS), or null for no payment reminders. */
  paymentReminderDays: number | null
  /** The first payment, which holds the spot, when the organizer sets it; null splits the price evenly. */
  firstPaymentCents: number | null
  galleryTitle: string
  showGuestNames: boolean
  /** How guests can pay the organizer; a guest picks one when they report a payment. */
  paymentMethods: PaymentMethod[]
  /** Anything else about paying, beside the methods. */
  paymentInstructions: string
  published: boolean
  photos: TripPhoto[]
  highlights: TripHighlight[]
  keyDates: TripKeyDate[]
  /** The most guests the trip takes; null for no limit. */
  maxGuests: number | null
  joinMode: JoinMode
  refundPolicy: RefundPolicy
  options: TripOptions
}

export interface OrganizerTrip extends TripInput {
  id: string
  slug: string
  guests: Guest[]
  /** The system's waitlist buffer (System Settings), so Trip Control can tell when a spot opened as the database does. */
  waitlistBufferPercent: number
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
  question: 'A question about Travel HQ',
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
  /** What a guest in this room pays, per person (issue #30); null or left out: the trip's price. */
  priceCents?: number | null
}

/** What a guest in a room pays: its own price, or the trip's when it has none. */
export const roomPrice = (room: { priceCents?: number | null } | undefined, tripCents: number) =>
  room?.priceCents ?? tripCents

/**
 * Whether any room costs something other than the trip's price. Then guests must pick a room when they join, so they
 * sign the price of the room they'll be in (owner's decision, 2026-10-29).
 */
export const roomsPricedApart = (rooms: { priceCents?: number | null }[], tripCents: number) =>
  rooms.some((r) => roomPrice(r, tripCents) !== tripCents)

export const ROOMS_PRICED_APART =
  'Rooms with their own prices need guests to pick a room when they join, so they sign the price of the room they’ll be in.'

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
  /** What a guest who picks it pays, per person, and the trip's payment plan at that price (issue #30). */
  priceCents: number
  paymentPlan: PlannedPayment[]
}

/** What a signed-in guest sends from the join page: their details, and their signature on the agreement. */
export interface JoinInput {
  name: string
  phone: string
  email: string
  /** Optional: the room they'd like, and who they'd share with. */
  roomId?: string | null
  roomNote?: string
  /** Their full name, typed as their signature. */
  typedName: string
  /** The "I agree" box, unticked until they tick it. */
  agreed: boolean
  /** The SHA-256 of the agreement they were shown, so a trip changed in the meantime is never signed unseen. */
  agreementHash: string
  /**
   * The version of Travel HQ's Terms of Use they ticked, when the join page asked (only someone who hasn't accepted
   * the current version is asked). Refused unless it is the current version.
   */
  termsVersion?: string
  /** The Terms of Use box, ticked; required with `termsVersion`. */
  termsAgreed?: boolean
  /**
   * Signing up someone else (a child, a roommate) whom the signer looks after: the name, phone and email are the
   * traveler's (theirs or the signer's), the typed name is the signer's, and they sign the agreement on the
   * traveler's behalf (`JoinView.agreementOnBehalf`).
   */
  onBehalf?: boolean
}

/** Taking over the place someone signed you up with: the Terms of Use, when the join page asked for them. */
export interface ClaimInput {
  termsVersion?: string
  termsAgreed?: boolean
}

/** Where the on-behalf agreement names the person signing and the traveler, filled in as they type them. */
export const AGREEMENT_SIGNER = '[[signer]]'
export const AGREEMENT_TRAVELER = '[[traveler]]'

/**
 * The on-behalf agreement with both names in it (owner's decision, 2026-10-28), as the screen shows it and as it's
 * kept once signed: the same function on both sides, so what's kept is what was shown. A name not typed yet shows as
 * `blank`.
 */
export function fillAgreementNames(
  text: string,
  signer: string,
  traveler: string,
  blank = { signer: '[your full name]', traveler: '[their full name]' }
): string {
  const tidy = (name: string, empty: string) => name.trim().replace(/\s+/g, ' ') || empty
  return text
    .split(AGREEMENT_SIGNER)
    .join(tidy(signer, blank.signer))
    .split(AGREEMENT_TRAVELER)
    .join(tidy(traveler, blank.traveler))
}

/** The trip agreement as it stands for a trip today, before anyone signs it. */
export interface AgreementPreview {
  text: string
  textHash: string
  templateVersion: string
}

/** The signed-in guest's own place on a trip, as their join page shows it. */
export interface MyGuest {
  id: string
  status: GuestStatus
  firstName: string
  lastName: string
  spotPaidAt: string | null
  refundSentAt: string | null
  /** On the waitlist, and whether an organizer offered them a spot. */
  waitlistedAt: string | null
  offeredAt: string | null
  roomId: string | null
  terms: GuestTerms | null
  agreement: SignedAgreement | null
  payments: Payment[]
  /** The credits and charges that count on their balance, with the organizer's reasons, oldest first. */
  adjustments: BalanceAdjustment[]
  /**
   * How to pay the organizer: the methods and the note. Only ever sent to a guest who joined (on an accept_first
   * trip, once accepted); empty otherwise.
   */
  paymentMethods: PaymentMethod[]
  paymentInstructions: string
}

/** The join page: the trip, the agreement to sign, and the guest's own place once they've joined. */
export interface JoinView {
  trip: PublicTrip
  agreement: AgreementPreview
  me: MyGuest | null
  /**
   * The agreement as someone signs it on behalf of a traveler they look after, with AGREEMENT_SIGNER and
   * AGREEMENT_TRAVELER where the names go (fillAgreementNames); its fingerprint is of this text, before the names.
   */
  agreementOnBehalf: AgreementPreview
  /** The travelers this person signed up and looks after on this trip, in the order they signed them up. */
  managed: MyGuest[]
  /**
   * Someone signed this person up with one of their emails and they haven't joined themselves: who signed (the name
   * they typed). Saying "That's me" takes over that place (ClaimInput).
   */
  claimable: { signedBy: string } | null
  /** Where this person stands with Travel HQ's Terms of Use: the join page asks for them if not accepted. */
  termsOfUse: TermsStatus
  /**
   * The agreement for each room priced apart from the trip (issue #30): picking it, the guest signs its price. Rooms
   * not listed take `agreement` (and `agreementOnBehalf`).
   */
  roomAgreements: {
    roomId: string
    agreement: AgreementPreview
    agreementOnBehalf: AgreementPreview
  }[]
}

/** The organizer's changes to one guest from the Trip Control panel. */
export interface GuestUpdate {
  /** Accept, turn down, or put back to waiting. */
  status?: GuestStatus
  /** Offer a waitlisted guest the spot that opened (on the pay-first trips; accepting does it on the others). */
  offerSpot?: boolean
  /** Take back an offer nobody has paid toward: the guest goes back on the waitlist. */
  withdrawOffer?: boolean
  /** Turning down a guest whose payment arrived needs this: the organizer says the refund went out. */
  refundSent?: boolean
  /** Move the guest to a room, or null for no room. */
  roomId?: string | null
  /** Who looks after them: another guest on the trip with an account (by guest id), or null for themselves. */
  managedBy?: string | null
  /** A corrected email address, after emails to the old one bounced. Clears the email problem. */
  email?: string
  /** The organizer saw the email problem (a spam complaint): clears it without changing the address. */
  emailProblemSeen?: boolean
}

/**
 * Travel HQ's own documents, apart from any trip agreement: the Terms of Use everyone accepts, and the Organizer
 * Terms anyone who runs a trip accepts as well.
 */
export type TermsKind = 'use' | 'organizer'

export interface TermsSection {
  heading: string
  body: string
}

/** One of Travel HQ's documents. `version` is the fingerprint of its wording: change a word and it changes. */
export interface TermsDocument {
  kind: TermsKind
  title: string
  version: string
  sections: TermsSection[]
}

/** Both documents, as the /terms page and the Terms screens show them. */
export interface PublicTerms {
  use: TermsDocument
  organizer: TermsDocument
}

/** Where the signed-in person stands with one document. */
export interface TermsStatus {
  version: string
  accepted: boolean
  /** They accepted an earlier version, so the screen says the Terms were updated rather than asking for the first time. */
  previouslyAccepted: boolean
}

export interface MyTerms {
  use: TermsStatus
  organizer: TermsStatus
}

/** The versions the person accepts, as shown to them. Accepting the Organizer Terms takes the Terms of Use with it. */
export interface AcceptTermsInput {
  use: string
  organizer?: string
}

/** The code on a 403 from an organizer route while the person hasn't accepted the current Organizer Terms. */
export const TERMS_REQUIRED_CODE = 'terms_required'

/** app-wide values the platform admin sets in the Admin toolbox (System Settings). */
export interface SystemSettings {
  /**
   * On the trips where guests pay before they're accepted, joining goes to the waitlist once the guests who can see
   * how to pay fill the spots left plus this percent of them, rounded up. 0 to 100.
   */
  waitlistBufferPercent: number
}

// ── What needs the organizer ─────────────────────────────────────────────────
// The rules for Trip Control's Actions, shared so the API counts the same things the screen lists (the red count in
// the account menu and on Your trips). The screen adds the words.

/** One thing the organizer does next for a guest. */
export type GuestAction =
  // A payment the guest reported, to confirm (in one tap) or, when it is short of what was due, to review. One transfer
  // for several travelers is one action: its payments share the key (the transfer).
  | { kind: 'payment'; key: string; payment: Payment; due: number; short: boolean }
  // A guest ready to accept: signed, and on the pay-first trips some payment arrived.
  | { kind: 'accept'; key: string }
  // Their payment arrived but every spot is taken: they're owed it back.
  | { kind: 'refund'; key: string; paidCents: number }
  // Emails to them bounced (fix the address) or they marked one as spam (the organizer just needs to know).
  | { kind: 'email'; key: string; problem: 'bounced' | 'complained' }
  // Their room costs more or less than the price they signed (issue #30): charge or credit the difference, or leave it.
  | { kind: 'room_price'; key: string; diffCents: number }

/** Money the organizer confirmed arrived from a guest (refunded payments don't count). */
export const confirmedCents = (g: Guest): number =>
  g.payments
    .filter((p) => p.status === 'confirmed')
    .reduce((n, p) => n + (p.receivedPaymentAmount ?? 0), 0)

/**
 * What was due when a payment was reported, as the guest saw it then: the first payment, less what they had already
 * reported or had confirmed before this one (payments not received don't count). Zero once the spot was covered.
 */
export function dueWhenSent(payment: Payment, payments: Payment[], terms: GuestTerms): number {
  const before = payments
    .filter((p) => p.reportedAt < payment.reportedAt && p.id !== payment.id)
    .reduce(
      (n, p) =>
        n +
        (p.status === 'confirmed'
          ? (p.receivedPaymentAmount ?? 0)
          : p.status === 'reported'
            ? p.guestPaymentAmount
            : 0),
      0
    )
  return Math.max(0, terms.firstInstallmentCents - before)
}

/**
 * Guests waiting on the waitlist for a spot (not yet offered one), in the order they joined it. The order is only for
 * reading: the organizer offers a spot to anyone on it (owner's decision, 2026-10-27).
 */
export function waitlist(guests: Guest[]): Guest[] {
  return guests
    .filter((g) => g.status === 'interested' && g.waitlistedAt && !g.offeredAt)
    .sort((a, b) => a.waitlistedAt!.localeCompare(b.waitlistedAt!))
}

/**
 * Whether someone joining now goes on the waitlist, as the database decides it (trip_waitlisting): every spot taken,
 * or, where guests pay first, the guests who can already see how to pay (waiting, not refunded, not on the waitlist
 * unless offered a spot) fill the spots left plus the system's waitlist buffer (System Settings), rounded up.
 */
export function waitlisting(
  trip: { maxGuests: number | null; joinMode: JoinMode; waitlistBufferPercent: number },
  guests: Guest[]
): boolean {
  if (trip.maxGuests === null) return false
  const spotsLeft = trip.maxGuests - guests.filter((g) => g.status === 'approved').length
  if (spotsLeft <= 0) return true
  if (trip.joinMode === 'accept_first') return false
  const inLine = guests.filter(
    (g) => g.status === 'interested' && !g.refundSentAt && (!g.waitlistedAt || g.offeredAt)
  ).length
  return inLine >= spotsLeft + Math.ceil((spotsLeft * trip.waitlistBufferPercent) / 100)
}

/** Every spot is taken (accepted guests at the limit). */
export const tripFull = (trip: OrganizerTrip): boolean =>
  trip.maxGuests !== null &&
  trip.guests.filter((g) => g.status === 'approved').length >= trip.maxGuests

/** What the organizer does next for one guest, if anything: the trip's own steps, then an email problem. */
export function guestActions(g: Guest, trip: OrganizerTrip): GuestAction[] {
  const steps = tripSteps(g, trip)
  if (g.status === 'declined') return steps
  if (g.terms && g.roomPriceDiffCents !== 0)
    steps.push({ kind: 'room_price', key: `${g.id}-room-price`, diffCents: g.roomPriceDiffCents })
  return g.emailProblem
    ? [...steps, { kind: 'email', key: `${g.id}-email`, problem: g.emailProblem }]
    : steps
}

function tripSteps(g: Guest, trip: OrganizerTrip): GuestAction[] {
  if (g.status === 'declined' || !g.signedAt) return []
  const full = tripFull(trip)
  // Someone on the waitlist waits for the organizer to pick them (waitlistSpotOpen), not for an action of their own.
  if (g.status === 'interested' && g.waitlistedAt && !g.offeredAt) return []
  const payFirst = trip.joinMode !== 'accept_first'
  const paid = confirmedCents(g)
  const out: GuestAction[] = g.payments
    .filter((p) => p.status === 'reported')
    .map((p) => {
      const due = g.terms ? dueWhenSent(p, g.payments, g.terms) : 0
      return {
        kind: 'payment',
        key: p.transferId ?? p.id,
        payment: p,
        due,
        short: p.guestPaymentAmount < due,
      }
    })
  if (g.status !== 'interested') return out
  if (full) {
    if (paid && !g.refundSentAt)
      out.push({ kind: 'refund', key: `${g.id}-refund`, paidCents: paid })
    return out
  }
  if (payFirst && !paid) return out
  out.push({ kind: 'accept', key: `${g.id}-accept` })
  return out
}

/**
 * A spot opened while people wait on the waitlist: one action for the trip, to open the waitlist and offer it to
 * whoever the organizer picks. On an accept-first trip, a spot not taken. On the others, more spots left than guests
 * already able to pay for one (waiting, not refunded, not on the waitlist unless offered a spot): the buffer that lets
 * newcomers join (waitlisting) doesn't count here, so one spot asks for one offer.
 */
export function waitlistSpotOpen(trip: OrganizerTrip): boolean {
  if (waitlist(trip.guests).length === 0 || tripFull(trip)) return false
  if (trip.joinMode === 'accept_first' || trip.maxGuests === null) return true
  const spotsLeft = trip.maxGuests - trip.guests.filter((g) => g.status === 'approved').length
  const inLine = trip.guests.filter(
    (g) => g.status === 'interested' && !g.refundSentAt && (!g.waitlistedAt || g.offeredAt)
  ).length
  return spotsLeft > inLine
}

/** Everything that needs the organizer on a trip: the red count beside Actions. */
export const tripActionCount = (trip: OrganizerTrip): number =>
  new Set(trip.guests.flatMap((g) => guestActions(g, trip).map((a) => a.key))).size +
  (waitlistSpotOpen(trip) ? 1 : 0)

/** The red count in the account menu: each trip or trip page that needs the signed-in person, and how many things. */
export interface MyActions {
  total: number
  items: {
    /** Where to go: a trip's Trip Control (organizer), or a guest's join page. */
    href: string
    name: string
    count: number
    /** 'organizer' for a trip they run; 'guest' for one they joined (something to pay). */
    as: 'organizer' | 'guest'
  }[]
}

/** An organizer asking for something Travel HQ doesn't do yet (for now, other refund terms). */
export interface OrganizerRequestInput {
  kind: 'refund_terms'
  /** The trip they were setting up, if it's saved. */
  tripId?: string
  text: string
}

/** A request as the Admin toolbox lists it. */
export interface OrganizerRequest {
  id: string
  kind: 'refund_terms'
  /** Who asked, by name (from sign-in), and the trip they were setting up. */
  userName: string
  tripName: string
  text: string
  createdAt: string
}

/** A variable an email template can use, as the Emails page lists it; a list has fields for inside {{#each}}. */
export interface EmailVariable {
  path: string
  label: string
  fields?: { name: string; label: string }[]
}

/** One email Travel HQ sends, as the Admin toolbox's Emails page edits it. */
export interface EmailTemplateView {
  kind: string
  name: string
  /** When it goes out, in one line. */
  when: string
  subject: string
  /** HTML with {{variables}}, inside Travel HQ's frame when sent. */
  body: string
  /** The variables this email may use, in groups ("Trip", "Guest", "Payment details"). */
  variables: { group: string; items: EmailVariable[] }[]
  /** Still the wording Travel HQ started with (no admin version saved). */
  isDefault: boolean
  updatedAt: string | null
}

export interface EmailTemplateInput {
  subject: string
  body: string
}

/** Who a preview is written to: a guest who can pay now, one who can't yet, or one on the waitlist. */
export type EmailPreviewGuest = 'can_pay' | 'not_yet' | 'waitlisted'

/** A template filled in for a sample guest, or what's wrong with its subject and its body, each shown beside it. */
export interface EmailPreview {
  subjectProblems: string[]
  bodyProblems: string[]
  subject: string
  html: string
  text: string
}

/** A bounce, a send blocked because the address bounced before, or a spam complaint, as Resend reported it. */
export interface EmailProblemNotice {
  id: string
  address: string
  kind: 'bounced' | 'blocked' | 'complained'
  /** The email's subject, and Resend's reason (the receiving server's words). */
  subject: string
  detail: string
  at: string
  /** The guests on that address now, and whether each one's problem is still waiting for their organizer. */
  guests: { tripId: string; tripName: string; name: string; open: boolean }[]
}

/** A reminder still to go out, for Trip Control's Reminders section. */
export interface UpcomingReminder {
  date: string
  label: string
  paymentDue: boolean
  /** The day it goes out ('YYYY-MM-DD'), in the morning (US time). */
  sendOn: string
  /** Who it would go to if it went out now, by name: accepted guests, or for a payment those who owe by then. */
  to: string[]
}

/** A reminder that went out: to whom, and when it started. */
export interface SentReminder {
  date: string
  label: string
  paymentDue: boolean
  sentAt: string
  to: string[]
}

export interface TripReminders {
  upcoming: UpcomingReminder[]
  sent: SentReminder[]
  /** Guests who stopped updates for this trip, by name: reminders skip them. */
  stopped: string[]
}

/** The "Stop updates for this trip" page, reached from the link in a reminder. */
export interface StopUpdatesView {
  tripName: string
  firstName: string
  stopped: boolean
}

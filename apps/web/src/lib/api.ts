import {
  TERMS_REQUIRED_CODE,
  type AcceptTermsInput,
  type AdminForwardedReceipts,
  type AgreementPreview,
  type BalanceAdjustmentInput,
  type ContactInput,
  type EmailPreview,
  type EmailPreviewGuest,
  type EmailProblemNotice,
  type EmailTemplateInput,
  type EmailTemplateView,
  type Expense,
  type ExpenseInput,
  type GuestEvent,
  type GuestUpdate,
  type DismissReceiptReason,
  type MatchReceiptInput,
  type ReceiptProof,
  type TripReceipts,
  type ClaimInput,
  type JoinInput,
  type JoinMode,
  type JoinView,
  type MyActions,
  type MyTerms,
  type OrganizerRequest,
  type OrganizerRequestInput,
  type OrganizerTrip,
  type PaymentDecision,
  type PaymentLog,
  type PaymentReport,
  type PublicTerms,
  type PublicTrip,
  type SignedAgreement,
  type StopUpdatesView,
  type SystemSettings,
  type TripReminders,
  type TripInput,
  type TripLogEntry,
  type TripPeople,
  type TripPersonInput,
  type TripRole,
  type TripRoom,
  type TripSummary,
} from '@cc/types'

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

/** A trip as Your trips and the Admin toolbox list it: who runs it and how many have signed up. */
export interface ListedTrip extends TripSummary {
  ownerName: string | null
  guestCount: number
  goingCount: number
  interestedCount: number
  maxGuests: number | null
  joinMode: JoinMode
  /** What needs you on the trip, as Trip Control's Actions counts it (Your trips only). */
  actionCount?: number
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string
  ) {
    super(message)
  }
}

/** Fired on `window` when an organizer request is refused because the Organizer Terms changed; the Terms screen shows. */
export const TERMS_REQUIRED_EVENT = 'cc:terms-required'

// Set by the auth provider once Clerk loads; organizer and join requests carry the signed-in user's token.
let getToken: () => Promise<string | null> = async () => null
export function setTokenGetter(fn: () => Promise<string | null>) {
  getToken = fn
}

/** Public pages and forms never wait on Clerk: a guest whose phone blocks it still sees the trip. */
const isPublic = (path: string) => path.startsWith('/public/') || path === '/contact'

/** The signed-in organizer's token, or null if Clerk doesn't answer within a few seconds. */
function tokenSoon(): Promise<string | null> {
  return Promise.race([
    getToken().catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
  ])
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = isPublic(path) ? null : await tokenSoon()
  const headers = new Headers(init?.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const res = await fetch(`${BASE}/api${path}`, { ...init, headers })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      message?: string | string[]
      code?: string
    } | null
    const message = Array.isArray(body?.message) ? body.message.join(', ') : body?.message
    if (res.status === 403 && body?.code === TERMS_REQUIRED_CODE)
      window.dispatchEvent(new Event(TERMS_REQUIRED_EVENT))
    throw new ApiError(message ?? `Request failed (${res.status})`, res.status, body?.code)
  }
  // An action with nothing to return (seating the admin) answers with an empty body, 201 or 204.
  const text = await res.text()
  return (text ? JSON.parse(text) : undefined) as T
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

const tripBase = (id: string, admin: boolean) => (admin ? `/admin/trips/${id}` : `/trips/${id}`)
const peopleBase = (id: string, admin: boolean) => `${tripBase(id, admin)}/people`

export const api = {
  listTrips: () => request<ListedTrip[]>('/trips'),
  myActions: () => request<MyActions>('/me/actions'),
  // `admin`: the Admin toolbox's read-only look at a trip it doesn't sit on (components/AdminView.tsx).
  getTrip: (id: string, admin = false) => request<OrganizerTrip>(tripBase(id, admin)),
  createTrip: (input: TripInput, slug?: string) =>
    request<OrganizerTrip>('/trips', json('POST', { ...input, slug })),
  updateTrip: (id: string, input: TripInput, slug?: string) =>
    request<OrganizerTrip>(`/trips/${id}`, json('PUT', { ...input, slug })),
  listSampleTrips: () => request<TripSummary[]>('/public/sample-trips'),
  getRooms: (id: string, admin = false) => request<TripRoom[]>(`${tripBase(id, admin)}/rooms`),
  setRooms: (id: string, rooms: TripRoom[]) =>
    request<TripRoom[]>(`/trips/${id}/rooms`, json('PUT', { rooms })),
  updateGuest: (id: string, guestId: string, update: GuestUpdate) =>
    request<OrganizerTrip>(`/trips/${id}/guests/${guestId}`, json('PATCH', update)),
  getAgreement: (id: string, admin = false) =>
    request<AgreementPreview>(`${tripBase(id, admin)}/agreement`),
  getGuestAgreement: (id: string, guestId: string, admin = false) =>
    request<SignedAgreement>(`${tripBase(id, admin)}/guests/${guestId}/agreement`),
  // A trip's People screen; `admin` uses the Admin toolbox's routes, which reach any trip without a seat.
  getPeople: (id: string, admin: boolean) => request<TripPeople>(peopleBase(id, admin)),
  addPerson: (id: string, input: TripPersonInput, admin: boolean) =>
    request<TripPeople>(peopleBase(id, admin), json('POST', input)),
  setPersonRole: (id: string, userId: string, role: TripRole, admin: boolean) =>
    request<TripPeople>(`${peopleBase(id, admin)}/${userId}`, json('PATCH', { role })),
  setInviteRole: (id: string, email: string, role: TripRole, admin: boolean) =>
    request<TripPeople>(
      `${tripBase(id, admin)}/invites/${encodeURIComponent(email)}`,
      json('PATCH', { role })
    ),
  cancelInvite: (id: string, email: string, admin: boolean) =>
    request<TripPeople>(`${tripBase(id, admin)}/invites/${encodeURIComponent(email)}`, {
      method: 'DELETE',
    }),
  removePerson: (id: string, userId: string, admin: boolean) =>
    request<TripPeople | null>(`${peopleBase(id, admin)}/${userId}`, { method: 'DELETE' }),
  getTripLog: (id: string, admin = false) => request<TripLogEntry[]>(`${tripBase(id, admin)}/log`),
  getGuestHistory: (id: string, guestId: string, admin = false) =>
    request<GuestEvent[]>(`${tripBase(id, admin)}/guests/${guestId}/history`),
  // The join page: a signed-in guest's own place on a trip.
  getJoin: (slug: string) => request<JoinView>(`/join/${slug}`),
  join: (slug: string, input: JoinInput) => request<JoinView>(`/join/${slug}`, json('POST', input)),
  // "That's me": a traveler takes over the place someone signed them up with.
  claim: (slug: string, input: ClaimInput) =>
    request<JoinView>(`/join/${slug}/claim`, json('POST', input)),
  reportPayment: (slug: string, report: PaymentReport) =>
    request<JoinView>(`/join/${slug}/payments`, json('POST', report)),
  decidePayment: (id: string, paymentId: string, decision: PaymentDecision) =>
    request<OrganizerTrip>(`/trips/${id}/payments/${paymentId}`, json('PATCH', decision)),
  logPayment: (id: string, guestId: string, log: PaymentLog) =>
    request<OrganizerTrip>(`/trips/${id}/guests/${guestId}/payments`, json('POST', log)),
  // Forwarded receipts (issue #12): the trip's address, matching or dismissing one the worker couldn't place, and the
  // email a payment was read from.
  setReceiptsAddress: (id: string, address: string) =>
    request<TripReceipts>(`/trips/${id}/receipts-address`, json('PUT', { address })),
  matchReceipt: (id: string, receiptId: string, input: MatchReceiptInput) =>
    request<OrganizerTrip>(`/trips/${id}/receipts/${receiptId}/match`, json('POST', input)),
  dismissReceipt: (id: string, receiptId: string, reason: DismissReceiptReason) =>
    request<OrganizerTrip>(`/trips/${id}/receipts/${receiptId}/dismiss`, json('POST', { reason })),
  forgetReceiptSender: (id: string, senderId: string) =>
    request<OrganizerTrip>(`/trips/${id}/receipt-senders/${senderId}`, { method: 'DELETE' }),
  getReceiptProof: (id: string, paymentId: string, admin = false) =>
    request<ReceiptProof>(`${tripBase(id, admin)}/payments/${paymentId}/receipt`),
  adminForwardedReceipts: () => request<AdminForwardedReceipts>('/admin/forwarded-receipts'),
  adminRunReceiptAgain: (id: string) =>
    request<AdminForwardedReceipts>(`/admin/forwarded-receipts/${id}/run-again`, json('POST', {})),
  adminReleaseAddress: (id: string, receivedSinceRemoval: number) =>
    request<AdminForwardedReceipts>(
      `/admin/receipts-addresses/${id}/release`,
      json('POST', { receivedSinceRemoval })
    ),
  // A credit or charge on a guest's balance (issue #17); removing one keeps it on record, marked removed.
  addAdjustment: (id: string, guestId: string, input: BalanceAdjustmentInput) =>
    request<OrganizerTrip>(`/trips/${id}/guests/${guestId}/adjustments`, json('POST', input)),
  removeAdjustment: (id: string, adjustmentId: string) =>
    request<OrganizerTrip>(`/trips/${id}/adjustments/${adjustmentId}`, { method: 'DELETE' }),
  // Trip Financials' vendor expenses; `admin` reads them through the Admin toolbox.
  getExpenses: (id: string, admin = false) => request<Expense[]>(`${tripBase(id, admin)}/expenses`),
  addExpense: (id: string, input: ExpenseInput) =>
    request<Expense[]>(`/trips/${id}/expenses`, json('POST', input)),
  updateExpense: (id: string, expenseId: string, input: ExpenseInput) =>
    request<Expense[]>(`/trips/${id}/expenses/${expenseId}`, json('PUT', input)),
  removeExpense: (id: string, expenseId: string) =>
    request<Expense[]>(`/trips/${id}/expenses/${expenseId}`, { method: 'DELETE' }),
  adminTrips: () => request<ListedTrip[]>('/admin/trips'),
  getSettings: () => request<SystemSettings>('/admin/settings'),
  adminRequests: () => request<OrganizerRequest[]>('/admin/requests'),
  addRequest: (input: OrganizerRequestInput) => request<void>('/requests', json('POST', input)),
  // The Admin toolbox's Emails page.
  adminEmails: () => request<EmailTemplateView[]>('/admin/emails'),
  adminEmailProblems: () => request<EmailProblemNotice[]>('/admin/emails/problems'),
  adminEmail: (kind: string) => request<EmailTemplateView>(`/admin/emails/${kind}`),
  previewEmail: (kind: string, draft: EmailTemplateInput, guest: EmailPreviewGuest) =>
    request<EmailPreview>(`/admin/emails/${kind}/preview?guest=${guest}`, json('POST', draft)),
  saveEmail: (kind: string, draft: EmailTemplateInput) =>
    request<EmailTemplateView>(`/admin/emails/${kind}`, json('PUT', draft)),
  resetEmail: (kind: string) =>
    request<EmailTemplateView>(`/admin/emails/${kind}`, { method: 'DELETE' }),
  setSettings: (settings: SystemSettings) =>
    request<SystemSettings>('/admin/settings', json('PUT', settings)),
  seatOnTrip: (id: string, asOwner = false) =>
    request<void>(`/admin/trips/${id}/seat`, json('POST', { asOwner })),
  getPublicTrip: (slug: string) => request<PublicTrip>(`/public/trips/${slug}`),
  // Trip Control's Reminders section, and the "Stop updates for this trip" link in each reminder.
  getReminders: (id: string) => request<TripReminders>(`/trips/${id}/reminders`),
  getStopUpdates: (token: string) => request<StopUpdatesView>(`/public/stop-updates/${token}`),
  setStopUpdates: (token: string, stopped: boolean) =>
    request<StopUpdatesView>(`/public/stop-updates/${token}`, json('POST', { stopped })),
  sendContact: (input: ContactInput) => request<void>('/contact', json('POST', input)),
  // Travel HQ's own Terms: the documents (public), and the signed-in person's acceptances.
  getTerms: () => request<PublicTerms>('/public/terms'),
  getMyTerms: () => request<MyTerms>('/me/terms'),
  acceptTerms: (input: AcceptTermsInput) => request<MyTerms>('/me/terms', json('POST', input)),
  uploadPhoto: (file: Blob, name: string) => {
    const form = new FormData()
    form.append('photo', file, name)
    return request<{ url: string }>('/photos', { method: 'POST', body: form })
  },
}

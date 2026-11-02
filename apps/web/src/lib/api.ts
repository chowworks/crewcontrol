import {
  TERMS_REQUIRED_CODE,
  type AcceptTermsInput,
  type AdminHelpEntry,
  type AdminHelpQuestion,
  type HelpAnswerInput,
  type HelpAskInput,
  type HelpEntry,
  type HelpEntryInput,
  type AdminForwardedReceipts,
  type AgreementPreview,
  type BalanceAdjustmentInput,
  type ContactInput,
  type EarlyAccessInput,
  type EmailPreview,
  type EmailPreviewGuest,
  type EmailProblemNotice,
  type AdminMetrics,
  type AdminSentEmails,
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
  type AnnouncementInput,
  type GuestAnnouncements,
  type MyQuestion,
  type QuestionAnswerInput,
  type TripQuestions,
  type InterestInput,
  type InterestTold,
  type InterestedPerson,
  type MyInterest,
  type OpenSignupsResult,
  type TripAnnouncements,
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
  /** Deleted: when it's erased for good (ISO). Your trips lists an owner's deleted trips until then. */
  eraseOn: string | null
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
  const res = await send(path, init)
  // An action with nothing to return (seating the admin) answers with an empty body, 201 or 204.
  const text = await res.text()
  return (text ? JSON.parse(text) : undefined) as T
}

/** The answer to a request that went through, or the reason it didn't as an ApiError. */
async function send(path: string, init?: RequestInit): Promise<Response> {
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
  return res
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
  deleteTrip: (id: string) => request<{ eraseOn: string }>(`/trips/${id}`, { method: 'DELETE' }),
  restoreTrip: (id: string) => request<void>(`/trips/${id}/restore`, { method: 'POST' }),
  myActions: () => request<MyActions>('/me/actions'),
  // `admin`: the Admin toolbox's read-only look at a trip it doesn't sit on (components/AdminView.tsx).
  getTrip: (id: string, admin = false) => request<OrganizerTrip>(tripBase(id, admin)),
  createTrip: (input: TripInput, slug?: string) =>
    request<OrganizerTrip>('/trips', json('POST', { ...input, slug })),
  updateTrip: (id: string, input: TripInput, slug?: string) =>
    request<OrganizerTrip>(`/trips/${id}`, json('PUT', { ...input, slug })),
  /** The cover photo for the trip flyer, or null when the browser can load the cover itself. */
  getFlyerCover: async (id: string) => {
    const res = await send(`/trips/${id}/flyer-cover`)
    return res.status === 204 ? null : res.blob()
  },
  /** Download everything's signed agreements (PDF) and photos, as a zip. */
  getExportFiles: async (id: string) =>
    new Uint8Array(await (await send(`/trips/${id}/export-files`)).arrayBuffer()),
  listSampleTrips: () => request<TripSummary[]>('/public/sample-trips'),
  getRooms: (id: string, admin = false) => request<TripRoom[]>(`${tripBase(id, admin)}/rooms`),
  setRooms: (id: string, rooms: TripRoom[]) =>
    request<TripRoom[]>(`/trips/${id}/rooms`, json('PUT', { rooms })),
  // An organizer going on their own trip, and not after all (issue #53).
  goingToo: (id: string, input: { name: string; phone: string; email: string }) =>
    request<OrganizerTrip>(`/trips/${id}/going`, json('POST', input)),
  notGoing: (id: string) => request<OrganizerTrip>(`/trips/${id}/going`, { method: 'DELETE' }),
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
  settleRoomPrice: (id: string, guestId: string, adjust: boolean) =>
    request<OrganizerTrip>(`/trips/${id}/guests/${guestId}/room-price`, json('POST', { adjust })),
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
  // Organizer help (issue #66).
  help: () => request<HelpEntry[]>('/help'),
  askHelp: (input: HelpAskInput) => request<void>('/help/questions', json('POST', input)),
  adminHelp: () =>
    request<{ entries: AdminHelpEntry[]; questions: AdminHelpQuestion[] }>('/admin/help'),
  adminHelpWaiting: () => request<{ questions: number; changed: number }>('/admin/help/waiting'),
  addHelpEntry: (input: HelpEntryInput) =>
    request<AdminHelpEntry[]>('/admin/help/entries', json('POST', input)),
  saveHelpEntry: (key: string, input: HelpEntryInput) =>
    request<AdminHelpEntry[]>(`/admin/help/entries/${encodeURIComponent(key)}`, json('PUT', input)),
  resetHelpEntry: (key: string) =>
    request<AdminHelpEntry[]>(`/admin/help/entries/${encodeURIComponent(key)}`, {
      method: 'DELETE',
    }),
  answerHelpQuestion: (id: string, input: HelpAnswerInput) =>
    request<{ emailed: boolean }>(`/admin/help/questions/${id}/answer`, json('POST', input)),
  addRequest: (input: OrganizerRequestInput) => request<void>('/requests', json('POST', input)),
  approveEarlyAccess: (id: string, approved: boolean) =>
    request<void>(`/admin/requests/${id}/approved`, json('PUT', { approved })),
  // Referrals (issue #39): someone who runs a trip refers a person; the admin approves them to start trips.
  refer: (input: EarlyAccessInput) => request<void>('/requests/referrals', json('POST', input)),
  canStartTrips: () => request<{ allowed: boolean }>('/requests/can-start-trips'),
  publicSettings: () => request<{ limitedPreview: boolean }>('/public/settings'),
  // The Admin toolbox's Emails page.
  adminEmails: () => request<EmailTemplateView[]>('/admin/emails'),
  adminEmailProblems: () => request<EmailProblemNotice[]>('/admin/emails/problems'),
  adminSentEmails: () => request<AdminSentEmails>('/admin/emails/sent'),
  adminMetrics: () => request<AdminMetrics>('/admin/metrics'),
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
  // Announcements (issue #12): Trip Control's, and the join page's for the signed-in guest.
  getAnnouncements: (id: string) => request<TripAnnouncements>(`/trips/${id}/announcements`),
  postAnnouncement: (id: string, input: AnnouncementInput) =>
    request<TripAnnouncements>(`/trips/${id}/announcements`, json('POST', input)),
  pinAnnouncement: (id: string, aid: string, pinned: boolean) =>
    request<TripAnnouncements>(`/trips/${id}/announcements/${aid}`, json('PATCH', { pinned })),
  removeAnnouncement: (id: string, aid: string) =>
    request<TripAnnouncements>(`/trips/${id}/announcements/${aid}`, { method: 'DELETE' }),
  replyAsOrganizer: (id: string, aid: string, body: string) =>
    request<TripAnnouncements>(`/trips/${id}/announcements/${aid}/replies`, json('POST', { body })),
  removeReplyAsOrganizer: (id: string, aid: string, rid: string) =>
    request<TripAnnouncements>(`/trips/${id}/announcements/${aid}/replies/${rid}`, {
      method: 'DELETE',
    }),
  getGuestAnnouncements: (slug: string) =>
    request<GuestAnnouncements>(`/join/${slug}/announcements`),
  replyAsGuest: (slug: string, aid: string, body: string) =>
    request<GuestAnnouncements>(
      `/join/${slug}/announcements/${aid}/replies`,
      json('POST', { body })
    ),
  removeOwnReply: (slug: string, aid: string, rid: string) =>
    request<GuestAnnouncements>(`/join/${slug}/announcements/${aid}/replies/${rid}`, {
      method: 'DELETE',
    }),
  // Questions, the trip page's FAQ (issue #13): Trip Control's, and the signed-in asker's own.
  getQuestions: (id: string) => request<TripQuestions>(`/trips/${id}/questions`),
  addQuestion: (id: string, input: QuestionAnswerInput) =>
    request<TripQuestions>(`/trips/${id}/questions`, json('POST', input)),
  answerQuestion: (id: string, qid: string, input: QuestionAnswerInput) =>
    request<TripQuestions>(`/trips/${id}/questions/${qid}/answer`, json('POST', input)),
  editQuestion: (id: string, qid: string, input: QuestionAnswerInput) =>
    request<TripQuestions>(`/trips/${id}/questions/${qid}`, json('PATCH', input)),
  reorderQuestions: (id: string, ids: string[]) =>
    request<TripQuestions>(`/trips/${id}/questions/order`, json('PUT', { ids })),
  removeQuestion: (id: string, qid: string) =>
    request<TripQuestions>(`/trips/${id}/questions/${qid}`, { method: 'DELETE' }),
  getMyQuestions: (slug: string) => request<MyQuestion[]>(`/join/${slug}/questions`),
  askQuestion: (slug: string, question: string) =>
    request<MyQuestion[]>(`/join/${slug}/questions`, json('POST', { question })),
  // Save the date's interest list (issue #47): Trip Control's, and the signed-in person's own entry.
  getInterest: (id: string) => request<InterestedPerson[]>(`/trips/${id}/interest`),
  removeInterest: (id: string, iid: string) =>
    request<InterestedPerson[]>(`/trips/${id}/interest/${iid}`, { method: 'DELETE' }),
  openSignups: (id: string, email: boolean) =>
    request<OpenSignupsResult>(`/trips/${id}/interest/open`, json('POST', { email })),
  tellInterested: (id: string) =>
    request<InterestTold>(`/trips/${id}/interest/tell`, { method: 'POST' }),
  getMyInterest: (slug: string) => request<MyInterest>(`/join/${slug}/interest`),
  addInterest: (slug: string, input: InterestInput) =>
    request<MyInterest>(`/join/${slug}/interest`, json('POST', input)),
  leaveInterest: (slug: string) =>
    request<MyInterest>(`/join/${slug}/interest`, { method: 'DELETE' }),
  getStopUpdates: (token: string) => request<StopUpdatesView>(`/public/stop-updates/${token}`),
  setStopUpdates: (token: string, stopped: boolean) =>
    request<StopUpdatesView>(`/public/stop-updates/${token}`, json('POST', { stopped })),
  sendContact: (input: ContactInput) => request<void>('/contact', json('POST', input)),
  // The limited preview page's early access form (no sign-in).
  askEarlyAccess: (input: EarlyAccessInput) => request<void>('/early-access', json('POST', input)),
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

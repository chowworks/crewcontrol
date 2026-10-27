import {
  TERMS_REQUIRED_CODE,
  type AcceptTermsInput,
  type AgreementPreview,
  type ContactInput,
  type GuestEvent,
  type GuestUpdate,
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
  type SystemSettings,
  type TripInput,
  type TripLogEntry,
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

export const api = {
  listTrips: () => request<ListedTrip[]>('/trips'),
  myActions: () => request<MyActions>('/me/actions'),
  getTrip: (id: string) => request<OrganizerTrip>(`/trips/${id}`),
  createTrip: (input: TripInput, slug?: string) =>
    request<OrganizerTrip>('/trips', json('POST', { ...input, slug })),
  updateTrip: (id: string, input: TripInput, slug?: string) =>
    request<OrganizerTrip>(`/trips/${id}`, json('PUT', { ...input, slug })),
  listSampleTrips: () => request<TripSummary[]>('/public/sample-trips'),
  getRooms: (id: string) => request<TripRoom[]>(`/trips/${id}/rooms`),
  setRooms: (id: string, rooms: TripRoom[]) =>
    request<TripRoom[]>(`/trips/${id}/rooms`, json('PUT', { rooms })),
  updateGuest: (id: string, guestId: string, update: GuestUpdate) =>
    request<OrganizerTrip>(`/trips/${id}/guests/${guestId}`, json('PATCH', update)),
  getAgreement: (id: string) => request<AgreementPreview>(`/trips/${id}/agreement`),
  getGuestAgreement: (id: string, guestId: string) =>
    request<SignedAgreement>(`/trips/${id}/guests/${guestId}/agreement`),
  getTripLog: (id: string) => request<TripLogEntry[]>(`/trips/${id}/log`),
  getGuestHistory: (id: string, guestId: string) =>
    request<GuestEvent[]>(`/trips/${id}/guests/${guestId}/history`),
  // The join page: a signed-in guest's own place on a trip.
  getJoin: (slug: string) => request<JoinView>(`/join/${slug}`),
  join: (slug: string, input: JoinInput) => request<JoinView>(`/join/${slug}`, json('POST', input)),
  reportPayment: (slug: string, report: PaymentReport) =>
    request<JoinView>(`/join/${slug}/payments`, json('POST', report)),
  decidePayment: (id: string, paymentId: string, decision: PaymentDecision) =>
    request<OrganizerTrip>(`/trips/${id}/payments/${paymentId}`, json('PATCH', decision)),
  logPayment: (id: string, guestId: string, log: PaymentLog) =>
    request<OrganizerTrip>(`/trips/${id}/guests/${guestId}/payments`, json('POST', log)),
  adminTrips: () => request<ListedTrip[]>('/admin/trips'),
  getSettings: () => request<SystemSettings>('/admin/settings'),
  adminRequests: () => request<OrganizerRequest[]>('/admin/requests'),
  addRequest: (input: OrganizerRequestInput) => request<void>('/requests', json('POST', input)),
  setSettings: (settings: SystemSettings) =>
    request<SystemSettings>('/admin/settings', json('PUT', settings)),
  seatOnTrip: (id: string, asOwner = false) =>
    request<void>(`/admin/trips/${id}/seat`, json('POST', { asOwner })),
  getPublicTrip: (slug: string) => request<PublicTrip>(`/public/trips/${slug}`),
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

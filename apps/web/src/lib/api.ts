import type {
  AgreementPreview,
  ContactInput,
  GuestEvent,
  GuestUpdate,
  JoinInput,
  JoinMode,
  JoinView,
  OrganizerTrip,
  PublicTrip,
  SignedAgreement,
  TripInput,
  TripLogEntry,
  TripRoom,
  TripSummary,
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
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
  }
}

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
    const body = (await res.json().catch(() => null)) as { message?: string | string[] } | null
    const message = Array.isArray(body?.message) ? body.message.join(', ') : body?.message
    throw new ApiError(message ?? `Request failed (${res.status})`, res.status)
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
  markPaid: (slug: string) => request<JoinView>(`/join/${slug}/paid`, json('POST', {})),
  adminTrips: () => request<ListedTrip[]>('/admin/trips'),
  seatOnTrip: (id: string, asOwner = false) =>
    request<void>(`/admin/trips/${id}/seat`, json('POST', { asOwner })),
  getPublicTrip: (slug: string) => request<PublicTrip>(`/public/trips/${slug}`),
  sendContact: (input: ContactInput) => request<void>('/contact', json('POST', input)),
  uploadPhoto: (file: Blob, name: string) => {
    const form = new FormData()
    form.append('photo', file, name)
    return request<{ url: string }>('/photos', { method: 'POST', body: form })
  },
}

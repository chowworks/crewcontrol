import type { ContactInput, OrganizerTrip, PublicTrip, TripInput, TripSummary } from '@cc/types'

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, init)
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string | string[] } | null
    const message = Array.isArray(body?.message) ? body.message.join(', ') : body?.message
    throw new ApiError(message ?? `Request failed (${res.status})`, res.status)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

export const api = {
  listTrips: () => request<TripSummary[]>('/trips'),
  getTrip: (id: string) => request<OrganizerTrip>(`/trips/${id}`),
  createTrip: (input: TripInput) => request<OrganizerTrip>('/trips', json('POST', input)),
  updateTrip: (id: string, input: TripInput) =>
    request<OrganizerTrip>(`/trips/${id}`, json('PUT', input)),
  listSampleTrips: () => request<TripSummary[]>('/public/sample-trips'),
  getPublicTrip: (slug: string) => request<PublicTrip>(`/public/trips/${slug}`),
  sendContact: (input: ContactInput) => request<void>('/contact', json('POST', input)),
  uploadPhoto: (file: Blob, name: string) => {
    const form = new FormData()
    form.append('photo', file, name)
    return request<{ url: string }>('/photos', { method: 'POST', body: form })
  },
}

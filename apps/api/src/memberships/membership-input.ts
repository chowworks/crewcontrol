import { BadRequestException } from '@nestjs/common'
import {
  MEMBERSHIP_NOTE_MAX,
  PAID_FEATURES,
  type MembershipInput,
  type PaidFeature,
} from '../trips/trip-types'

const fail = (message: string): never => {
  throw new BadRequestException(message)
}

export const isPaidFeature = (v: unknown): v is PaidFeature =>
  PAID_FEATURES.some((f) => f.key === v)

/** An email as a membership is kept: trimmed and lowercased, shaped like an address. */
export function parseMemberEmail(raw: unknown): string {
  const email = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
  if (email.length < 3 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    fail('Enter an email like name@example.com.')
  return email
}

/** The admin's ticks, last day and note for one person. */
export function parseMembership(raw: unknown): MembershipInput {
  if (!raw || typeof raw !== 'object') fail('Expected a membership')
  const body = raw as Record<string, unknown>
  if (!Array.isArray(body.features) || !body.features.every(isPaidFeature))
    fail('features must be a list of paid features')
  const features = [...new Set(body.features as PaidFeature[])]
  if (features.length === 0) fail('Tick at least one feature.')
  const endsOn = body.endsOn ?? null
  if (endsOn !== null) {
    if (typeof endsOn !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(endsOn))
      fail('The end date must be a date.')
    const d = new Date(`${endsOn as string}T00:00:00Z`)
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== endsOn)
      fail('The end date must be a date.')
  }
  const note = typeof body.note === 'string' ? body.note.trim() : ''
  if (note.length > MEMBERSHIP_NOTE_MAX)
    fail(`Keep the note under ${MEMBERSHIP_NOTE_MAX} characters.`)
  return { features, endsOn: endsOn as string | null, note }
}

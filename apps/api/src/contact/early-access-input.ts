import { BadRequestException } from '@nestjs/common'
import type { EarlyAccessInput } from '../trips/trip-types'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function fail(message: string): never {
  throw new BadRequestException(message)
}

function text(body: Record<string, unknown>, key: string, label: string, max: number): string {
  const value = body[key] ?? ''
  if (typeof value !== 'string') fail(`${label} must be text`)
  const trimmed = value.trim()
  if (trimmed.length > max) fail(`${label} must be at most ${max} characters`)
  return trimmed
}

/** Checks the early access form. Messages say what to fix, because the form shows them as they are. */
export function parseEarlyAccess(raw: unknown): EarlyAccessInput {
  if (typeof raw !== 'object' || raw === null) fail('Send the form as JSON')
  const body = raw as Record<string, unknown>
  const name = text(body, 'name', 'Name', 120)
  if (!name) fail('Name is required')
  const email = text(body, 'email', 'Email', 254).toLowerCase()
  if (!EMAIL.test(email)) fail('Email must be an email address')
  return {
    name,
    email,
    note: text(body, 'note', 'Note', 2000),
    website: typeof body.website === 'string' ? body.website : '',
  }
}

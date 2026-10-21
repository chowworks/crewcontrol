import { BadRequestException } from '@nestjs/common'
import { CONTACT_TOPICS, type ContactInput, type ContactTopic } from '../trips/trip-types'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function fail(message: string): never {
  throw new BadRequestException(message)
}

function text(body: Record<string, unknown>, key: string, label: string, max: number): string {
  const value = body[key]
  if (typeof value !== 'string' || !value.trim()) fail(`${label} is required`)
  const trimmed = value.trim()
  if (trimmed.length > max) fail(`${label} must be at most ${max} characters`)
  return trimmed
}

/** Checks a contact form body. Messages say what to fix, because the form shows them as they are. */
export function parseContactInput(raw: unknown): ContactInput {
  if (typeof raw !== 'object' || raw === null) fail('Send the form as JSON')
  const body = raw as Record<string, unknown>
  const email = text(body, 'email', 'Email', 254)
  if (!EMAIL.test(email)) fail('Email must be an email address')
  const topic = body.topic
  if (!CONTACT_TOPICS.includes(topic as ContactTopic)) fail('Pick a topic')
  return {
    name: text(body, 'name', 'Name', 120),
    email,
    topic: topic as ContactTopic,
    message: text(body, 'message', 'Message', 4000),
    website: typeof body.website === 'string' ? body.website : '',
  }
}

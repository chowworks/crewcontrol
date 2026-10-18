import { BadRequestException } from '@nestjs/common'
import {
  HIGHLIGHT_ICONS,
  MAX_TRIP_PHOTOS,
  type HighlightIcon,
  type TripHighlight,
  type TripInput,
  type TripKeyDate,
  type TripPhoto,
} from './trip-types'

const DATE = /^\d{4}-\d{2}-\d{2}$/

type Body = Record<string, unknown>

function fail(message: string): never {
  throw new BadRequestException(message)
}

function text(body: Body, key: string, max: number, required = true): string {
  const value = body[key]
  if (typeof value !== 'string') fail(`${key} must be text`)
  const trimmed = value.trim()
  if (required && !trimmed) fail(`${key} is required`)
  if (trimmed.length > max) fail(`${key} must be at most ${max} characters`)
  return trimmed
}

function date(body: Body, key: string): string {
  const value = text(body, key, 10)
  if (!DATE.test(value) || Number.isNaN(Date.parse(value)))
    fail(`${key} must be a date (YYYY-MM-DD)`)
  return value
}

function int(body: Body, key: string, min: number, max: number): number {
  const value = body[key]
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max)
    fail(`${key} must be a whole number from ${min} to ${max}`)
  return value
}

function bool(body: Body, key: string): boolean {
  const value = body[key]
  if (typeof value !== 'boolean') fail(`${key} must be true or false`)
  return value
}

function list(body: Body, key: string, max: number): Body[] {
  const value = body[key]
  if (!Array.isArray(value)) fail(`${key} must be a list`)
  if (value.length > max) fail(`A trip can have at most ${max} ${key}`)
  return value.map((item) =>
    item && typeof item === 'object' ? (item as Body) : fail(`${key} has a bad entry`)
  )
}

function photo(item: Body): TripPhoto {
  const url = text(item, 'url', 2000)
  if (!/^(https?:\/\/|\/(?!\/))/.test(url)) fail('A photo URL must start with http(s):// or /')
  return { url, caption: text(item, 'caption', 120, false) }
}

function highlight(item: Body): TripHighlight {
  const icon = item.icon
  if (!HIGHLIGHT_ICONS.includes(icon as HighlightIcon))
    fail(`icon must be one of ${HIGHLIGHT_ICONS.join(', ')}`)
  return {
    title: text(item, 'title', 60),
    detail: text(item, 'detail', 160, false),
    icon: icon as HighlightIcon,
  }
}

function keyDate(item: Body): TripKeyDate {
  return { date: date(item, 'date'), label: text(item, 'label', 160) }
}

/** Checks a trip body from the organizer editor and returns it cleaned up, or throws a 400 naming the problem. */
export function parseTripInput(raw: unknown): TripInput {
  if (!raw || typeof raw !== 'object') fail('Expected a trip')
  const body = raw as Body
  const startDate = date(body, 'startDate')
  const endDate = date(body, 'endDate')
  if (endDate < startDate) fail('endDate must be on or after startDate')
  return {
    name: text(body, 'name', 80),
    destination: text(body, 'destination', 80),
    startDate,
    endDate,
    organizerName: text(body, 'organizerName', 60),
    description: text(body, 'description', 2000, false),
    costPerPersonCents: int(body, 'costPerPersonCents', 0, 100_000_00),
    installmentCount: int(body, 'installmentCount', 1, 24),
    galleryTitle: text(body, 'galleryTitle', 40, false) || 'Photos',
    showGuestNames: bool(body, 'showGuestNames'),
    paymentInstructions: text(body, 'paymentInstructions', 1000, false),
    published: bool(body, 'published'),
    photos: list(body, 'photos', MAX_TRIP_PHOTOS).map(photo),
    highlights: list(body, 'highlights', 8).map(highlight),
    keyDates: list(body, 'keyDates', 20)
      .map(keyDate)
      .sort((a, b) => a.date.localeCompare(b.date)),
  }
}

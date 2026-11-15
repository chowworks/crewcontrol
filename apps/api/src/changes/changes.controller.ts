import { BadRequestException, Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import type { Caller } from '../auth/caller'
import { CurrentCaller, SignedInGuard } from '../auth/signed-in.guard'
import { RateLimiter } from '../core/rate-limit'
import { OrganizerTermsGuard } from '../terms/organizer-terms.guard'
import {
  CHANGE_NOTE_MAX,
  CHANGE_REPLY_MAX,
  CHANGE_REQUEST_MAX,
  type ChangeCloseInput,
} from '../trips/trip-types'
import { ChangesService } from './changes.service'

const fields = (raw: unknown) =>
  (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>

/** Checks one text field: written (unless optional), and short enough. */
function text(raw: unknown, name: string, max: number, missing: string | null): string {
  const value = fields(raw)[name]
  const t = typeof value === 'string' ? value.trim() : ''
  if (!t && missing) throw new BadRequestException(missing)
  if (t.length > max)
    throw new BadRequestException(`Keep it to ${max.toLocaleString('en-US')} characters`)
  return t
}

export const parseRequest = (raw: unknown) =>
  text(raw, 'request', CHANGE_REQUEST_MAX, 'Describe the change you’d like')

export const parseNote = (raw: unknown) => text(raw, 'text', CHANGE_NOTE_MAX, 'Write the note')

/** Checks closing a request: done or not possible, and the message to the guest (required when not possible). */
export function parseClose(raw: unknown): ChangeCloseInput {
  const status = fields(raw).status
  if (status !== 'done' && status !== 'declined')
    throw new BadRequestException('Choose whether it’s done or not possible')
  const reply = text(
    raw,
    'reply',
    CHANGE_REPLY_MAX,
    status === 'declined' ? 'Tell them why it’s not possible' : null
  )
  return { status, reply }
}

/** Trip Control's trip change requests: the trip's organizers read them, add notes and close them. */
@Controller('trips')
@UseGuards(SignedInGuard, OrganizerTermsGuard)
export class ChangesController {
  constructor(private readonly changes: ChangesService) {}

  @Get(':id/changes')
  list(@Param('id') id: string, @CurrentCaller() caller: Caller) {
    return this.changes.forTrip(id, caller)
  }

  @Post(':id/changes/:rid/notes')
  note(
    @Param('id') id: string,
    @Param('rid') rid: string,
    @Body() body: unknown,
    @CurrentCaller() caller: Caller
  ) {
    return this.changes.addNote(id, rid, parseNote(body), caller)
  }

  @Post(':id/changes/:rid/close')
  close(
    @Param('id') id: string,
    @Param('rid') rid: string,
    @Body() body: unknown,
    @CurrentCaller() caller: Caller
  ) {
    return this.changes.close(id, rid, parseClose(body), caller)
  }
}

/** The trip page's "Request a trip change": an accepted guest asks, and reads their own requests. */
@Controller('join')
@UseGuards(SignedInGuard)
export class AskChangesController {
  constructor(private readonly changes: ChangesService) {}

  // Per person and trip, so one account can't flood an organizer's Actions.
  private readonly limit = new RateLimiter(
    5,
    10 * 60 * 1000,
    'Too many requests. Wait a few minutes.'
  )

  @Get(':slug/changes')
  mine(@Param('slug') slug: string, @CurrentCaller() caller: Caller) {
    return this.changes.mine(slug, caller)
  }

  @Post(':slug/changes')
  ask(@Param('slug') slug: string, @Body() body: unknown, @CurrentCaller() caller: Caller) {
    const request = parseRequest(body)
    this.limit.hit(`${slug}|${caller.userId}`)
    return this.changes.ask(slug, request, caller)
  }
}

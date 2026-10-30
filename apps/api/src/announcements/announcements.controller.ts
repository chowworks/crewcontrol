import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common'
import type { Caller } from '../auth/caller'
import { CurrentCaller, SignedInGuard } from '../auth/signed-in.guard'
import { RateLimiter } from '../core/rate-limit'
import { OrganizerTermsGuard } from '../terms/organizer-terms.guard'
import {
  ANNOUNCEMENT_MAX,
  REPLY_MAX,
  type AnnouncementAudience,
  type AnnouncementInput,
} from '../trips/trip-types'
import { AnnouncementsService } from './announcements.service'

const fields = (raw: unknown) =>
  (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>

/** Checks "Post an announcement": the message, who it's for, and the two ticks. */
export function parseAnnouncement(raw: unknown): AnnouncementInput {
  const b = fields(raw)
  const body = typeof b.body === 'string' ? b.body.trim() : ''
  if (!body) throw new BadRequestException('Write the announcement')
  if (body.length > ANNOUNCEMENT_MAX)
    throw new BadRequestException(
      `Keep it to ${ANNOUNCEMENT_MAX.toLocaleString('en-US')} characters`
    )
  if (!['accepted', 'owing'].includes(b.audience as string))
    throw new BadRequestException('Choose who it’s for')
  if (typeof b.email !== 'boolean' || typeof b.pinned !== 'boolean')
    throw new BadRequestException('email and pinned must be true or false')
  return { body, audience: b.audience as AnnouncementAudience, email: b.email, pinned: b.pinned }
}

export function parseReply(raw: unknown): string {
  const b = fields(raw)
  const body = typeof b.body === 'string' ? b.body.trim() : ''
  if (!body) throw new BadRequestException('Write a reply')
  if (body.length > REPLY_MAX)
    throw new BadRequestException(`Keep it to ${REPLY_MAX.toLocaleString('en-US')} characters`)
  return body
}

/** Trip Control's Announcements: the trip's organizers post, pin, reply and remove. */
@Controller('trips')
@UseGuards(SignedInGuard, OrganizerTermsGuard)
export class AnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  @Get(':id/announcements')
  list(@Param('id') id: string, @CurrentCaller() caller: Caller) {
    return this.announcements.forTrip(id, caller)
  }

  @Post(':id/announcements')
  post(@Param('id') id: string, @Body() body: unknown, @CurrentCaller() caller: Caller) {
    return this.announcements.post(id, parseAnnouncement(body), caller)
  }

  @Patch(':id/announcements/:aid')
  pin(
    @Param('id') id: string,
    @Param('aid') aid: string,
    @Body() body: unknown,
    @CurrentCaller() caller: Caller
  ) {
    const pinned = fields(body).pinned
    if (typeof pinned !== 'boolean') throw new BadRequestException('pinned must be true or false')
    return this.announcements.setPinned(id, aid, pinned, caller)
  }

  @Delete(':id/announcements/:aid')
  remove(@Param('id') id: string, @Param('aid') aid: string, @CurrentCaller() caller: Caller) {
    return this.announcements.remove(id, aid, caller)
  }

  @Post(':id/announcements/:aid/replies')
  reply(
    @Param('id') id: string,
    @Param('aid') aid: string,
    @Body() body: unknown,
    @CurrentCaller() caller: Caller
  ) {
    return this.announcements.organizerReply(id, aid, parseReply(body), caller)
  }

  @Delete(':id/announcements/:aid/replies/:rid')
  removeReply(@Param('id') id: string, @Param('rid') rid: string, @CurrentCaller() caller: Caller) {
    return this.announcements.removeReplyAsOrganizer(id, rid, caller)
  }
}

/** The join page's Announcements: a signed-in guest reads the posts for them and replies under them. */
@Controller('join')
@UseGuards(SignedInGuard)
export class GuestAnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  // Per person and trip, so one account can't flood a trip's replies.
  private readonly limit = new RateLimiter(
    20,
    10 * 60 * 1000,
    'Too many replies. Wait a few minutes.'
  )

  @Get(':slug/announcements')
  list(@Param('slug') slug: string, @CurrentCaller() caller: Caller) {
    return this.announcements.forGuest(slug, caller)
  }

  @Post(':slug/announcements/:aid/replies')
  reply(
    @Param('slug') slug: string,
    @Param('aid') aid: string,
    @Body() body: unknown,
    @CurrentCaller() caller: Caller
  ) {
    const text = parseReply(body)
    this.limit.hit(`${slug}|${caller.userId}`)
    return this.announcements.guestReply(slug, aid, text, caller)
  }

  @Delete(':slug/announcements/:aid/replies/:rid')
  removeReply(
    @Param('slug') slug: string,
    @Param('rid') rid: string,
    @CurrentCaller() caller: Caller
  ) {
    return this.announcements.removeOwnReply(slug, rid, caller)
  }
}

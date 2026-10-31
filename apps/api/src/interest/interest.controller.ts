import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common'
import type { Caller } from '../auth/caller'
import { CurrentCaller, SignedInGuard } from '../auth/signed-in.guard'
import { RateLimiter } from '../core/rate-limit'
import { OrganizerTermsGuard } from '../terms/organizer-terms.guard'
import type { InterestInput } from '../trips/trip-types'
import { InterestService } from './interest.service'

/** Checks "I'm interested": a name, and a phone number the organizer can text (as for joining). */
export function parseInterest(raw: unknown): InterestInput {
  const b = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const name = typeof b.name === 'string' ? b.name.trim().replace(/\s+/g, ' ') : ''
  const phone = typeof b.phone === 'string' ? b.phone.trim() : ''
  if (!name) throw new BadRequestException('Add your name')
  if (name.length > 120) throw new BadRequestException('Keep your name to 120 characters')
  if (phone.replace(/\D/g, '').length < 7 || phone.length > 40)
    throw new BadRequestException('Add a phone number we can text')
  return { name, phone }
}

/** Trip Control's Interested list: the trip's organizers read it, remove people and tell them sign-ups are open. */
@Controller('trips')
@UseGuards(SignedInGuard, OrganizerTermsGuard)
export class InterestController {
  constructor(private readonly interest: InterestService) {}

  @Get(':id/interest')
  list(@Param('id') id: string, @CurrentCaller() caller: Caller) {
    return this.interest.forTrip(id, caller)
  }

  @Post(':id/interest/open')
  open(@Param('id') id: string, @Body() body: unknown, @CurrentCaller() caller: Caller) {
    const email = (typeof body === 'object' && body !== null ? body : {}) as { email?: unknown }
    return this.interest.openSignups(id, email.email === true, caller)
  }

  @Post(':id/interest/tell')
  tell(@Param('id') id: string, @CurrentCaller() caller: Caller) {
    return this.interest.tell(id, caller)
  }

  @Delete(':id/interest/:iid')
  remove(@Param('id') id: string, @Param('iid') iid: string, @CurrentCaller() caller: Caller) {
    return this.interest.remove(id, iid, caller)
  }
}

/** The trip page's "I'm interested": a signed-in person adds themselves, reads their entry and takes it off. */
@Controller('join')
@UseGuards(SignedInGuard)
export class MyInterestController {
  constructor(private readonly interest: InterestService) {}

  // Per person and trip, so one account can't hammer a trip's list.
  private readonly limit = new RateLimiter(
    10,
    10 * 60 * 1000,
    'Too many tries. Wait a few minutes.'
  )

  @Get(':slug/interest')
  mine(@Param('slug') slug: string, @CurrentCaller() caller: Caller) {
    return this.interest.mine(slug, caller)
  }

  @Post(':slug/interest')
  add(@Param('slug') slug: string, @Body() body: unknown, @CurrentCaller() caller: Caller) {
    const input = parseInterest(body)
    this.limit.hit(`${slug}|${caller.userId}`)
    return this.interest.add(slug, input, caller)
  }

  @Delete(':slug/interest')
  leave(@Param('slug') slug: string, @CurrentCaller() caller: Caller) {
    this.limit.hit(`${slug}|${caller.userId}`)
    return this.interest.leave(slug, caller)
  }
}

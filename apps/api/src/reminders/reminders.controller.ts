import { BadRequestException, Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import type { Caller } from '../auth/caller'
import { CurrentCaller, SignedInGuard } from '../auth/signed-in.guard'
import { OrganizerTermsGuard } from '../terms/organizer-terms.guard'
import { RemindersService } from './reminders.service'

/** Trip Control's Reminders section: what goes out when, what went, and who stopped them. */
@Controller('trips')
@UseGuards(SignedInGuard, OrganizerTermsGuard)
export class RemindersController {
  constructor(private readonly reminders: RemindersService) {}

  @Get(':id/reminders')
  list(@Param('id') id: string, @CurrentCaller() caller: Caller) {
    return this.reminders.forTrip(id, caller)
  }
}

/**
 * The link in each reminder ("Stop updates for this trip"). No sign-in: the link's secret names the guest. Opening it
 * changes nothing (mail scanners open links); the page's button does.
 */
@Controller('public/stop-updates')
export class StopUpdatesController {
  constructor(private readonly reminders: RemindersService) {}

  @Get(':token')
  view(@Param('token') token: string) {
    return this.reminders.stopView(token)
  }

  @Post(':token')
  set(@Param('token') token: string, @Body() body: unknown) {
    const stopped = (body as { stopped?: unknown } | null)?.stopped
    if (typeof stopped !== 'boolean') throw new BadRequestException('stopped must be true or false')
    return this.reminders.setStopped(token, stopped)
  }
}

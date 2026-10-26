import { Body, Controller, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common'
import type { Caller } from '../auth/caller'
import { runAsPublic } from '../core/tenant-context'
import { ClerkService } from '../auth/clerk.service'
import { AdminOnly, CurrentCaller, SignedInGuard } from '../auth/signed-in.guard'
import {
  parseGuestUpdate,
  parsePaymentDecision,
  parsePaymentLog,
  parseRooms,
  parseSlug,
  parseSystemSettings,
  parseTripInput,
} from './trip-input'
import { TripsService } from './trips.service'

// Organizer endpoints: signed in with Clerk, and only for the caller's own trips (admins: every trip).
@Controller('trips')
@UseGuards(SignedInGuard)
export class TripsController {
  constructor(
    private readonly trips: TripsService,
    private readonly clerk: ClerkService
  ) {}

  @Get()
  async list(@CurrentCaller() caller: Caller) {
    return withOwnerNames(await this.trips.list(caller), this.clerk)
  }

  @Post()
  create(@Body() body: unknown, @CurrentCaller() caller: Caller) {
    return this.trips.create(parseTripInput(body), caller, parseSlug(body))
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentCaller() caller: Caller) {
    return this.trips.get(id, caller)
  }

  // The agreement as this trip's guests would sign it today (read-only: organizers can't edit it).
  @Get(':id/agreement')
  agreement(@Param('id') id: string, @CurrentCaller() caller: Caller) {
    return this.trips.agreement(id, caller)
  }

  @Get(':id/guests/:guestId/agreement')
  guestAgreement(
    @Param('id') id: string,
    @Param('guestId') guestId: string,
    @CurrentCaller() caller: Caller
  ) {
    return this.trips.guestAgreement(id, guestId, caller)
  }

  @Get(':id/log')
  log(@Param('id') id: string, @CurrentCaller() caller: Caller) {
    return this.trips.log(id, caller)
  }

  @Get(':id/guests/:guestId/history')
  guestHistory(
    @Param('id') id: string,
    @Param('guestId') guestId: string,
    @CurrentCaller() caller: Caller
  ) {
    return this.trips.guestHistory(id, guestId, caller)
  }

  @Get(':id/rooms')
  rooms(@Param('id') id: string, @CurrentCaller() caller: Caller) {
    return this.trips.getRooms(id, caller)
  }

  @Put(':id/rooms')
  setRooms(@Param('id') id: string, @Body() body: unknown, @CurrentCaller() caller: Caller) {
    return this.trips.setRooms(id, parseRooms(body), caller)
  }

  @Patch(':id/guests/:guestId')
  updateGuest(
    @Param('id') id: string,
    @Param('guestId') guestId: string,
    @Body() body: unknown,
    @CurrentCaller() caller: Caller
  ) {
    return this.trips.updateGuest(id, guestId, parseGuestUpdate(body), caller)
  }

  // A reported payment: it arrived, it didn't, or undo that.
  @Patch(':id/payments/:paymentId')
  decidePayment(
    @Param('id') id: string,
    @Param('paymentId') paymentId: string,
    @Body() body: unknown,
    @CurrentCaller() caller: Caller
  ) {
    return this.trips.decidePayment(id, paymentId, parsePaymentDecision(body), caller)
  }

  // A payment the organizer saw arrive (handed over in person), logged as confirmed.
  @Post(':id/guests/:guestId/payments')
  logPayment(
    @Param('id') id: string,
    @Param('guestId') guestId: string,
    @Body() body: unknown,
    @CurrentCaller() caller: Caller
  ) {
    return this.trips.logPayment(id, guestId, parsePaymentLog(body), caller)
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: unknown, @CurrentCaller() caller: Caller) {
    return this.trips.update(id, parseTripInput(body), caller, parseSlug(body))
  }
}

@Controller('public/trips')
export class PublicTripsController {
  constructor(private readonly trips: TripsService) {}

  // Joining needs sign-in: see join/join.controller.ts.
  @Get(':slug')
  get(@Param('slug') slug: string) {
    return runAsPublic(() => this.trips.getPublic(slug))
  }
}

@Controller('public/sample-trips')
export class SampleTripsController {
  constructor(private readonly trips: TripsService) {}

  @Get()
  list() {
    return runAsPublic(() => this.trips.listSamples())
  }
}

/**
 * The Admin toolbox: every trip, and seating the admin on one so it can open it as a member (as an organizer, or as
 * the owner of a trip that has none). The database logs each seat (TripMember_9_admin_logged).
 */
@Controller('admin')
@UseGuards(SignedInGuard)
@AdminOnly()
export class AdminController {
  constructor(
    private readonly trips: TripsService,
    private readonly clerk: ClerkService
  ) {}

  @Get('trips')
  async allTrips() {
    return withOwnerNames(await this.trips.listAll(), this.clerk)
  }

  @Post('trips/:id/seat')
  seat(@Param('id') id: string, @Body() body: unknown, @CurrentCaller() caller: Caller) {
    const asOwner = (body as { asOwner?: unknown } | null)?.asOwner === true
    return this.trips.seat(id, caller, asOwner)
  }

  // System Settings: CrewControl-wide values (for now, the waitlist buffer).
  @Get('settings')
  settings() {
    return this.trips.settings()
  }

  @Put('settings')
  setSettings(@Body() body: unknown, @CurrentCaller() caller: Caller) {
    return this.trips.setSettings(parseSystemSettings(body), caller)
  }
}

/** A trip list with its owners' names from Clerk in place of their ids (Your trips and Trip admin alike). */
async function withOwnerNames<T extends { ownerIds: string[] }>(trips: T[], clerk: ClerkService) {
  const names = await clerk.names([...new Set(trips.flatMap((t) => t.ownerIds))])
  return trips.map(({ ownerIds, ...t }) => ({
    ...t,
    ownerName: ownerIds.length ? ownerIds.map((id) => names.get(id) ?? 'Unknown').join(', ') : null,
  }))
}
